-- FCCD RAG upgrade (Phase 1): feature flags for the FAQ RAG pipeline.
--
-- The retrieval stack (pgvector, hybrid RRF, rerank, aliases) is added in later
-- phases. Phase 1 only introduces a configuration surface so the low-risk
-- improvements (query rewrite, grounded clarification, conversation context)
-- can be enabled per environment without a redeploy.

alter table public.customer_service_config_versions
  add column if not exists rag_config jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_service_config_versions_rag_config_object'
      and conrelid = 'public.customer_service_config_versions'::regclass
  ) then
    alter table public.customer_service_config_versions
      add constraint customer_service_config_versions_rag_config_object
      check (jsonb_typeof(rag_config) = 'object');
  end if;
end;
$$;

comment on column public.customer_service_config_versions.rag_config is
  'RAG feature flags: enable_rag_v2, enable_query_rewrite, enable_grounded_clarification, context_rounds. Empty object falls back to environment variables.';

-- Preserve the existing list RPC but surface the flag bag to the admin UI.
-- Adding a column to RETURNS TABLE changes the OUT row type, which
-- CREATE OR REPLACE cannot do, so the old function is dropped first.
drop function if exists public.customer_service_config_versions_list(text);

create or replace function public.customer_service_config_versions_list(p_environment text default null)
returns table (
  id uuid, environment text, version integer, label text, model text, system_prompt text,
  temperature numeric, retrieval_limit integer, rag_config jsonb, status text,
  activated_at timestamptz, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query select c.id, c.environment, c.version, c.label, c.model, c.system_prompt,
    c.temperature, c.retrieval_limit, c.rag_config, c.status, c.activated_at, c.created_at
  from public.customer_service_config_versions c
  where p_environment is null or c.environment = p_environment
  order by c.environment, c.version desc;
end;
$$;

revoke all on function public.customer_service_config_versions_list(text) from public, anon;
grant execute on function public.customer_service_config_versions_list(text) to authenticated;

-- Update a draft config's RAG flags. Kept separate from config_create so the
-- existing create signature (and its callers) do not change.
create or replace function public.customer_service_config_set_rag(
  p_id uuid,
  p_rag_config jsonb
)
returns uuid
language plpgsql security definer set search_path = public, private
as $$
declare v_status text;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  select status into v_status from public.customer_service_config_versions where id = p_id for update;
  if not found then
    raise exception 'config_not_found' using errcode = 'P0002';
  end if;
  if v_status = 'archived' then
    raise exception 'config_archived' using errcode = '22023';
  end if;
  if p_rag_config is null or jsonb_typeof(p_rag_config) <> 'object' then
    raise exception 'rag_config_must_be_object' using errcode = '22023';
  end if;
  update public.customer_service_config_versions
    set rag_config = p_rag_config, updated_at = now()
    where id = p_id;
  return p_id;
end;
$$;

revoke all on function public.customer_service_config_set_rag(uuid, jsonb) from public, anon;
grant execute on function public.customer_service_config_set_rag(uuid, jsonb) to authenticated;
