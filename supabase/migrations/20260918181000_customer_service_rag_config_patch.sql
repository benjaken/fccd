begin;
-- Replace JSON keys atomically; never delete unspecified tuning settings.
create or replace function public.customer_service_config_set_rag(p_id uuid,p_rag_config jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog,public,private,pg_temp as $$
declare current_status text; merged jsonb; k text; v jsonb; n numeric;
begin
 if not private.has_page_access('settings.customer_faq.edit') then raise exception 'page_access_required' using errcode='42501'; end if;
 if p_rag_config is null or jsonb_typeof(p_rag_config)<>'object' then raise exception 'rag_config_must_be_object'; end if;
 select c.status,c.rag_config into current_status,merged from public.customer_service_config_versions c where c.id=p_id for update;
 if not found then raise exception 'config_not_found' using errcode='P0002'; end if;
 if current_status='archived' then raise exception 'config_archived'; end if;
 for k,v in select key,value from jsonb_each(p_rag_config) loop
  if k=any(array['enable_rag_v2','enable_query_rewrite','enable_grounded_clarification']) then
   if jsonb_typeof(v)<>'boolean' then raise exception 'rag_flag_must_be_boolean: %',k; end if;
  elsif k=any(array['context_rounds','lexical_top_k','vector_top_k','final_top_k','rrf_k','vector_weight','lexical_weight','vector_threshold']) then
   if jsonb_typeof(v)<>'number' then raise exception 'rag_setting_must_be_number: %',k; end if;
   n:=(v#>>'{}')::numeric;
   if k=any(array['context_rounds','lexical_top_k','vector_top_k','final_top_k','rrf_k']) and trunc(n)<>n then raise exception 'rag_setting_must_be_integer: %',k; end if;
   if (k='context_rounds' and (n<1 or n>8))
    or (k=any(array['lexical_top_k','vector_top_k']) and (n<1 or n>100))
    or (k='final_top_k' and (n<1 or n>50)) or (k='rrf_k' and (n<1 or n>500))
    or (k=any(array['vector_weight','lexical_weight']) and (n<0 or n>1))
    or (k='vector_threshold' and (n< -1 or n>1)) then raise exception 'rag_setting_out_of_range: %',k; end if;
  else raise exception 'unknown_rag_setting: %',k;
  end if;
 end loop;
 merged:=coalesce(merged,'{}'::jsonb)||p_rag_config;
 if coalesce((merged->>'vector_weight')::numeric,0.7)=0 and coalesce((merged->>'lexical_weight')::numeric,0.3)=0 then raise exception 'rag_weights_cannot_both_be_zero'; end if;
 update public.customer_service_config_versions set rag_config=merged,updated_at=now() where id=p_id;
 return p_id;
end;
$$;
revoke all on function public.customer_service_config_set_rag(uuid,jsonb) from public,anon;
grant execute on function public.customer_service_config_set_rag(uuid,jsonb) to authenticated;

-- RETURNS TABLE changes require DROP; preserve all previously used tiered fields.
drop function if exists public.customer_service_config_versions_list(text);
create function public.customer_service_config_versions_list(p_environment text default null)
returns table(
 id uuid,environment text,version integer,label text,model text,system_prompt text,
 temperature numeric,retrieval_limit integer,rag_config jsonb,status text,
 activated_at timestamptz,created_at timestamptz,
 fallback_model text,fallback_enabled boolean,escalation_confidence numeric
) language plpgsql stable security definer set search_path = pg_catalog,public,private,pg_temp as $$
begin
 if not private.has_page_access('settings.customer_faq') then raise exception 'page_access_required' using errcode='42501'; end if;
 return query select c.id,c.environment,c.version,c.label,c.model,c.system_prompt,c.temperature,
 c.retrieval_limit,c.rag_config,c.status,c.activated_at,c.created_at,
 c.fallback_model,c.fallback_enabled,c.escalation_confidence::numeric
 from public.customer_service_config_versions c
 where p_environment is null or c.environment=p_environment order by c.environment,c.version desc;
end;
$$;
revoke all on function public.customer_service_config_versions_list(text) from public,anon;
grant execute on function public.customer_service_config_versions_list(text) to authenticated;

-- Optional human labels. NULL means unlabelled, empty array means no FAQ is relevant.
alter table public.customer_service_test_cases add column if not exists expected_faq_ids uuid[];
-- Store safe per-sample diagnostics separately from aggregate metrics.
alter table public.customer_service_evaluation_runs add column if not exists rag_details jsonb not null default '[]'::jsonb;
-- Detect changing knowledge during paired evaluation without locking writers for model calls.
create or replace function public.customer_service_faq_index_snapshot()
returns text language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select md5(coalesce(string_agg(f.id::text||':'||f.embedding_revision::text||':'||f.embedding_status||':'||coalesce(f.embedding_profile,''),',' order by f.id),''))
 from public.customer_faqs f where f.is_published;
$$;
revoke all on function public.customer_service_faq_index_snapshot() from public,anon,authenticated;
grant execute on function public.customer_service_faq_index_snapshot() to service_role;
commit;
