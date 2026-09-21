-- FCCD 真人對話學習第一期（T04）：案例向量租約 worker 的資料庫介面。
-- 與 FAQ 相同：只有完成函式（SECURITY DEFINER）可寫向量表，revision/CAS 檢查
-- 是唯一的鮮度權威，較舊的 job 不能覆蓋新版本。
begin;
set local search_path = public, extensions, pg_temp;

revoke insert, update, delete on table public.customer_service_case_embeddings from service_role;

create or replace function public.customer_service_claim_case_embeddings(
  p_profile text,
  p_environment text,
  p_limit integer default 20,
  p_case_ids uuid[] default null,
  p_force boolean default false
) returns table(
  id uuid, scenario_context text, known_information jsonb, missing_information text[],
  response_strategy jsonb, applicability jsonb, revision bigint, claim_token uuid
)
language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp as $$
begin
  if coalesce(p_profile, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_embedding_profile' using errcode = '22023';
  end if;
  if coalesce(btrim(p_environment), '') = '' then
    raise exception 'case_environment_required' using errcode = '22023';
  end if;
  if p_force and coalesce(cardinality(p_case_ids), 0) = 0 then
    raise exception 'force_requires_case_ids' using errcode = '22023';
  end if;
  return query
  with selected as (
    select c.id from public.customer_service_cases c
    where c.environment = p_environment
      and c.status in ('draft', 'active')
      and (coalesce(cardinality(p_case_ids), 0) = 0 or c.id = any(p_case_ids))
      and (c.embedding_claim_until is null or c.embedding_claim_until < clock_timestamp())
      and (p_force or c.embedding_status <> 'ready' or c.embedding_profile is distinct from p_profile)
      and (p_force or c.embedding_retry_at is null or c.embedding_retry_at <= clock_timestamp())
    order by c.embedding_attempts, c.id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    for update skip locked
  ), claimed as (
    update public.customer_service_cases c set
      embedding_status = 'pending',
      embedding_claim_token = gen_random_uuid(),
      embedding_claim_until = clock_timestamp() + interval '2 minutes',
      embedding_target_profile = p_profile,
      embedding_attempts = c.embedding_attempts + 1
    from selected s where c.id = s.id
    returning c.id, c.scenario_context, c.known_information, c.missing_information,
      c.response_strategy, c.applicability, c.embedding_revision, c.embedding_claim_token
  )
  select c.id, c.scenario_context, c.known_information, c.missing_information,
    c.response_strategy, c.applicability, c.embedding_revision, c.embedding_claim_token
  from claimed c;
end;
$$;
revoke all on function public.customer_service_claim_case_embeddings(text, text, integer, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.customer_service_claim_case_embeddings(text, text, integer, uuid[], boolean) to service_role;

create or replace function public.customer_service_complete_case_embedding(
  p_id uuid, p_revision bigint, p_claim_token uuid, p_vector text,
  p_model text, p_profile text, p_hash text, p_content_version text default 'case-guidance-v1'
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp as $$
declare c public.customer_service_cases%rowtype; v vector(1024);
begin
  select * into c from public.customer_service_cases where id = p_id for update;
  if not found or c.status not in ('draft', 'active') or c.embedding_revision <> p_revision
    or c.embedding_claim_token is distinct from p_claim_token
    or c.embedding_target_profile is distinct from p_profile
    or c.embedding_claim_until is null or c.embedding_claim_until <= clock_timestamp() then
    return false;
  end if;
  if p_claim_token is null or coalesce(btrim(p_model), '') = '' or coalesce(btrim(p_hash), '') = '' then
    raise exception 'invalid_embedding_completion' using errcode = '22023';
  end if;
  v := p_vector::vector(1024); -- pgvector validates width and non-finite values.
  if v is null or vector_norm(v) = 0 then
    raise exception 'invalid_embedding_vector' using errcode = '22023';
  end if;
  insert into public.customer_service_case_embeddings
    (case_id, case_revision, embedding, model, profile, content_hash, content_version, updated_at)
  values (p_id, p_revision, v, p_model, p_profile, p_hash, coalesce(p_content_version, 'case-guidance-v1'), clock_timestamp())
  on conflict (case_id, model, case_revision) do update set
    embedding = excluded.embedding, profile = excluded.profile, content_hash = excluded.content_hash,
    content_version = excluded.content_version, updated_at = excluded.updated_at;
  update public.customer_service_cases set
    embedding_status = 'ready', content_hash = p_hash, embedding_profile = p_profile,
    embedding_updated_at = clock_timestamp(), embedding_claim_token = null,
    embedding_claim_until = null, embedding_target_profile = null, embedding_retry_at = null,
    embedding_attempts = 0, embedding_error = null
  where id = p_id;
  return true;
end;
$$;
revoke all on function public.customer_service_complete_case_embedding(uuid, bigint, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.customer_service_complete_case_embedding(uuid, bigint, uuid, text, text, text, text, text) to service_role;

create or replace function public.customer_service_release_case_embedding(
  p_id uuid, p_revision bigint, p_claim_token uuid, p_error text default null
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp as $$
declare affected integer;
begin
  update public.customer_service_cases c set
    embedding_status = case when p_error is null then 'pending' else 'failed' end,
    embedding_error = left(p_error, 200), embedding_claim_token = null,
    embedding_claim_until = null, embedding_target_profile = null,
    embedding_attempts = case when p_error is null then greatest(c.embedding_attempts - 1, 0) else c.embedding_attempts end,
    embedding_retry_at = case when p_error is null then null
      else clock_timestamp() + make_interval(secs => least(300, 10 * greatest(c.embedding_attempts, 1))) end
  where c.id = p_id and c.embedding_revision = p_revision and c.embedding_claim_token = p_claim_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke all on function public.customer_service_release_case_embedding(uuid, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.customer_service_release_case_embedding(uuid, bigint, uuid, text) to service_role;

commit;
