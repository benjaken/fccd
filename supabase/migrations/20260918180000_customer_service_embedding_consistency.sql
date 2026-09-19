-- Forward-only repair for f0b917a. Do not edit/re-run the historical dimension migration.
-- Existing vectors are retained but invalidated; rebuild via the new leased worker.
begin;
set local search_path = public, extensions, pg_temp;

alter table public.customer_faqs
  add column if not exists embedding_revision bigint not null default 1,
  add column if not exists embedding_profile text,
  add column if not exists embedding_claim_token uuid,
  add column if not exists embedding_claim_until timestamptz,
  add column if not exists embedding_target_profile text,
  add column if not exists embedding_retry_at timestamptz,
  add column if not exists embedding_attempts integer not null default 0,
  add column if not exists embedding_error text;
alter table public.customer_faq_embeddings
  add column if not exists faq_revision bigint not null default 0,
  add column if not exists profile text;
-- Block stale/in-flight legacy workers from bypassing the revision-checked RPC.
-- The SECURITY DEFINER completion function retains its owner privileges.
revoke insert, update, delete on table public.customer_faq_embeddings from service_role;

create or replace function public.customer_faqs_mark_embedding_pending()
returns trigger language plpgsql set search_path = pg_catalog, public, extensions, pg_temp as $$
begin
  if TG_OP = 'INSERT' then
    new.embedding_revision := 1;
    new.embedding_status := 'pending';
  elsif new.question is distinct from old.question
     or new.answer is distinct from old.answer
     or new.keywords is distinct from old.keywords
     or new.category is distinct from old.category
     or new.locale is distinct from old.locale
     or new.is_published is distinct from old.is_published then
    new.embedding_revision := old.embedding_revision + 1;
    new.embedding_status := 'pending';
  elsif new.embedding_revision is distinct from old.embedding_revision then
    -- Alias trigger and explicit invalidations use a monotonic revision.
    new.embedding_revision := old.embedding_revision + 1;
    new.embedding_status := 'pending';
  else
    return new;
  end if;
  new.content_hash := null;
  new.embedding_profile := null;
  new.embedding_updated_at := null;
  new.embedding_claim_token := null;
  new.embedding_claim_until := null;
  new.embedding_target_profile := null;
  new.embedding_retry_at := null;
  new.embedding_attempts := 0;
  new.embedding_error := null;
  return new;
end;
$$;
-- Previous migration already defines this trigger; recreate for clean installs too.
drop trigger if exists customer_faqs_embedding_pending on public.customer_faqs;
create trigger customer_faqs_embedding_pending before insert or update on public.customer_faqs
for each row execute function public.customer_faqs_mark_embedding_pending();

create or replace function public.customer_faq_aliases_invalidate_embedding()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp as $$
declare old_id uuid; new_id uuid; target_id uuid;
begin
  if TG_OP <> 'INSERT' then old_id := old.faq_id; end if;
  if TG_OP <> 'DELETE' then new_id := new.faq_id; end if;
  if TG_OP = 'UPDATE' and new.faq_id is not distinct from old.faq_id
     and new.alias_text is not distinct from old.alias_text
     and new.alias_type is not distinct from old.alias_type
     and new.locale is not distinct from old.locale
     and new.is_active is not distinct from old.is_active then return new; end if;
  -- Stable lock order avoids two moves locking the same parents in reverse order.
  for target_id in select distinct x from unnest(array[old_id,new_id]) as t(x)
    where x is not null order by x loop
    update public.customer_faqs set embedding_revision = embedding_revision + 1 where id = target_id;
  end loop;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.customer_faq_aliases_invalidate_embedding() from public, anon, authenticated;
drop trigger if exists customer_faq_aliases_embedding_pending on public.customer_faq_aliases;
create trigger customer_faq_aliases_embedding_pending after insert or update or delete on public.customer_faq_aliases
for each row execute function public.customer_faq_aliases_invalidate_embedding();

-- Retain old rows for inspection, but never let an old hash/model masquerade as current.
update public.customer_faqs set embedding_revision = embedding_revision + 1;
create index if not exists customer_faqs_embedding_work_idx
on public.customer_faqs (embedding_retry_at, embedding_attempts, sort_order, id) where is_published;

create or replace function public.customer_service_claim_faq_embeddings(
  p_profile text, p_limit integer default 20, p_faq_ids uuid[] default null, p_force boolean default false
) returns table(id uuid, question text, aliases text[], revision bigint, claim_token uuid)
language plpgsql security definer set search_path = pg_catalog, public, extensions, pg_temp as $$
begin
  if coalesce(p_profile,'') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_embedding_profile'; end if;
  if p_force and coalesce(cardinality(p_faq_ids),0) = 0 then raise exception 'force_requires_faq_ids'; end if;
  return query
  with selected as (
    select f.id from public.customer_faqs f
    where f.is_published
      and (coalesce(cardinality(p_faq_ids),0) = 0 or f.id = any(p_faq_ids))
      and (f.embedding_claim_until is null or f.embedding_claim_until < clock_timestamp())
      and (p_force or f.embedding_status <> 'ready' or f.embedding_profile is distinct from p_profile)
      and (p_force or f.embedding_retry_at is null or f.embedding_retry_at <= clock_timestamp())
    order by f.embedding_attempts, f.sort_order, f.id
    limit least(greatest(coalesce(p_limit,20),1),50)
    for update skip locked
  ), claimed as (
    update public.customer_faqs f set
      embedding_status = 'pending',
      embedding_claim_token = gen_random_uuid(),
      embedding_claim_until = clock_timestamp() + interval '2 minutes',
      embedding_target_profile = p_profile,
      embedding_attempts = f.embedding_attempts + 1
    from selected s where f.id = s.id
    returning f.id, f.question, f.embedding_revision, f.embedding_claim_token
  )
  select c.id,c.question,
    array(select a.alias_text from public.customer_faq_aliases a
      where a.faq_id=c.id and a.alias_type='similar' and a.is_active order by a.alias_text),
    c.embedding_revision,c.embedding_claim_token from claimed c;
end;
$$;
revoke all on function public.customer_service_claim_faq_embeddings(text,integer,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.customer_service_claim_faq_embeddings(text,integer,uuid[],boolean) to service_role;

create or replace function public.customer_service_complete_faq_embedding(
  p_id uuid,p_revision bigint,p_claim_token uuid,p_vector text,p_model text,p_profile text,p_hash text
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp as $$
declare f public.customer_faqs%rowtype; v vector(1024);
begin
  select * into f from public.customer_faqs where id=p_id for update;
  if not found or not f.is_published or f.embedding_revision <> p_revision
    or f.embedding_claim_token is distinct from p_claim_token
    or f.embedding_target_profile is distinct from p_profile
    or f.embedding_claim_until is null or f.embedding_claim_until <= clock_timestamp() then return false; end if;
  if p_claim_token is null or coalesce(btrim(p_model),'')='' or coalesce(btrim(p_hash),'')='' then raise exception 'invalid_embedding_completion'; end if;
  v := p_vector::vector(1024); -- pgvector validates width and non-finite values.
  if v is null or vector_norm(v) = 0 then raise exception 'invalid_embedding_vector'; end if;
  insert into public.customer_faq_embeddings
    (faq_id,source_type,source_id,embedding,model,content_hash,faq_revision,profile,updated_at)
  values (p_id,'question','question',v,p_model,p_hash,p_revision,p_profile,clock_timestamp())
  on conflict(faq_id,source_type,source_id) do update set
    embedding=excluded.embedding,model=excluded.model,content_hash=excluded.content_hash,
    faq_revision=excluded.faq_revision,profile=excluded.profile,updated_at=excluded.updated_at;
  update public.customer_faqs set embedding_status='ready',content_hash=p_hash,
    embedding_profile=p_profile,embedding_updated_at=clock_timestamp(),
    embedding_claim_token=null,embedding_claim_until=null,embedding_target_profile=null,
    embedding_retry_at=null,embedding_attempts=0,embedding_error=null where id=p_id;
  return true;
end;
$$;
revoke all on function public.customer_service_complete_faq_embedding(uuid,bigint,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.customer_service_complete_faq_embedding(uuid,bigint,uuid,text,text,text,text) to service_role;

create or replace function public.customer_service_release_faq_embedding(
  p_id uuid,p_revision bigint,p_claim_token uuid,p_error text default null
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp as $$
declare affected integer;
begin
  update public.customer_faqs f set
    embedding_status=case when p_error is null then 'pending' else 'failed' end,
    embedding_error=left(p_error,200),embedding_claim_token=null,
    embedding_claim_until=null,embedding_target_profile=null,
    embedding_attempts=case when p_error is null then greatest(f.embedding_attempts-1,0) else f.embedding_attempts end,
    embedding_retry_at=case when p_error is null then null
      else clock_timestamp()+make_interval(secs=>least(300,10*greatest(f.embedding_attempts,1))) end
  where f.id=p_id and f.embedding_revision=p_revision and f.embedding_claim_token=p_claim_token;
  get diagnostics affected=row_count;
  return affected=1;
end;
$$;
revoke all on function public.customer_service_release_faq_embedding(uuid,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.customer_service_release_faq_embedding(uuid,bigint,uuid,text) to service_role;

create or replace function public.search_published_customer_faqs_by_vector_v2(
  p_query_embedding text,p_model text,p_profile text,p_limit integer default 8,p_threshold double precision default 0.45
) returns table(id uuid,category text,question text,answer text,score numeric)
language plpgsql stable security definer set search_path = pg_catalog, public, extensions, pg_temp as $$
declare v vector(1024); take_count integer := least(greatest(coalesce(p_limit,8),1),100);
begin
  if coalesce(btrim(p_model),'')='' or coalesce(p_profile,'') !~ '^[a-f0-9]{64}$' then return; end if;
  v := p_query_embedding::vector(1024);
  if v is null or vector_norm(v)=0 then return; end if;
  -- Exact search over a MATERIALIZED eligible set: correctness first for the
  -- current FAQ corpus. Invalid rows cannot consume ANN/Top-K candidate slots.
  -- Benchmark before replacing with ANN iterative scanning on a larger corpus.
  return query with eligible as materialized (
    select f.id,f.category,f.question,f.answer,e.embedding
    from public.customer_faqs f join public.customer_faq_embeddings e on e.faq_id=f.id
    where f.is_published and f.embedding_status='ready'
      and f.embedding_profile=p_profile and e.profile=p_profile and e.model=p_model
      and e.faq_revision=f.embedding_revision and e.content_hash=f.content_hash
  ), scored as (
    select e.id,e.category,e.question,e.answer,(1-(e.embedding <=> v))::numeric as relevance from eligible e
  ), best as (
    select distinct on(s.id) s.* from scored s order by s.id,s.relevance desc
  )
  select b.id,b.category,b.question,b.answer,b.relevance from best b
  where b.relevance>=coalesce(p_threshold,0.45) order by b.relevance desc,b.id limit take_count;
end;
$$;
revoke all on function public.search_published_customer_faqs_by_vector_v2(text,text,text,integer,double precision) from public,anon,authenticated;
grant execute on function public.search_published_customer_faqs_by_vector_v2(text,text,text,integer,double precision) to service_role;

-- Old callers have no query model/profile: fail closed to lexical fallback.
-- Keep the signature during rolling deploys instead of serving mixed-model vectors.
create or replace function public.search_published_customer_faqs_by_vector(
 p_query_embedding text,p_limit integer default 8,p_threshold double precision default 0.0
) returns table(id uuid,category text,question text,answer text,score numeric)
language sql stable security definer set search_path = pg_catalog,public,extensions,pg_temp as $$
 select f.id,f.category,f.question,f.answer,0::numeric from public.customer_faqs f where false;
$$;
revoke all on function public.search_published_customer_faqs_by_vector(text,integer,double precision) from public,anon,authenticated;
grant execute on function public.search_published_customer_faqs_by_vector(text,integer,double precision) to service_role;
commit;
