-- Jev classifier config columns for customer_service_config_versions.
-- Additive: existing rows get safe defaults (Jev disabled).
alter table public.customer_service_config_versions
  add column if not exists jev_enabled boolean not null default false,
  add column if not exists jev_shadow boolean not null default true,
  add column if not exists jev_model text not null default 'jev-latest',
  add column if not exists jev_accept_threshold numeric not null default 0.80,
  add column if not exists jev_requires_human_threshold numeric not null default 0.50,
  add column if not exists jev_budget_ms integer not null default 1000;

-- Drop and recreate the list RPC (PostgreSQL cannot change return type in place).
drop function if exists public.customer_service_config_versions_list(text);

create function public.customer_service_config_versions_list(
  p_environment text default null
)
returns table (
  id uuid, environment text, version integer, label text, model text,
  fallback_model text, fallback_enabled boolean, escalation_confidence numeric,
  system_prompt text, temperature numeric, retrieval_limit integer,
  rag_config jsonb, status text, activated_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  jev_enabled boolean, jev_shadow boolean, jev_model text,
  jev_accept_threshold numeric, jev_requires_human_threshold numeric, jev_budget_ms integer
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
    select c.id, c.environment, c.version, c.label, c.model,
      c.fallback_model, c.fallback_enabled, c.escalation_confidence,
      c.system_prompt, c.temperature, c.retrieval_limit,
      c.rag_config, c.status, c.activated_at,
      c.created_at, c.updated_at,
      c.jev_enabled, c.jev_shadow, c.jev_model,
      c.jev_accept_threshold, c.jev_requires_human_threshold, c.jev_budget_ms
    from public.customer_service_config_versions c
    where p_environment is null or c.environment = p_environment
    order by c.environment, c.version desc;
end;
$$;

revoke all on function public.customer_service_config_versions_list(text) from public, anon, authenticated;
grant execute on function public.customer_service_config_versions_list(text) to service_role;

-- Drop and recreate the create RPC to avoid overload ambiguity.
drop function if exists public.customer_service_config_create_tiered(text, text, text, text, boolean, numeric, text, numeric, integer);

create function public.customer_service_config_create_tiered(
  p_environment text,
  p_label text,
  p_model text,
  p_fallback_model text default 'grok-4.5',
  p_fallback_enabled boolean default true,
  p_escalation_confidence numeric default 0.72,
  p_system_prompt text default '',
  p_temperature numeric default 0.10,
  p_retrieval_limit integer default 3,
  p_jev_enabled boolean default false,
  p_jev_shadow boolean default true,
  p_jev_model text default 'jev-latest',
  p_jev_accept_threshold numeric default 0.80,
  p_jev_requires_human_threshold numeric default 0.50,
  p_jev_budget_ms integer default 1000
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_id uuid;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if btrim(coalesce(p_model, '')) = '' then
    raise exception 'model_required' using errcode = '22023';
  end if;
  if p_fallback_enabled and btrim(coalesce(p_fallback_model, '')) = '' then
    raise exception 'fallback_model_required' using errcode = '22023';
  end if;

  insert into public.customer_service_config_versions(
    environment, version, label, model, fallback_model, fallback_enabled,
    escalation_confidence, system_prompt, temperature, retrieval_limit,
    jev_enabled, jev_shadow, jev_model, jev_accept_threshold,
    jev_requires_human_threshold, jev_budget_ms,
    created_by
  ) values (
    coalesce(nullif(btrim(p_environment), ''), 'develop'),
    coalesce((select max(c.version) + 1 from public.customer_service_config_versions c
      where c.environment = coalesce(nullif(btrim(p_environment), ''), 'develop')), 1),
    coalesce(nullif(btrim(p_label), ''), 'Draft'),
    btrim(p_model),
    coalesce(nullif(btrim(p_fallback_model), ''), 'grok-4.5'),
    p_fallback_enabled,
    coalesce(p_escalation_confidence, 0.72),
    coalesce(p_system_prompt, ''),
    coalesce(p_temperature, 0.10),
    coalesce(p_retrieval_limit, 3),
    coalesce(p_jev_enabled, false),
    coalesce(p_jev_shadow, true),
    coalesce(p_jev_model, 'jev-latest'),
    coalesce(p_jev_accept_threshold, 0.80),
    coalesce(p_jev_requires_human_threshold, 0.50),
    coalesce(p_jev_budget_ms, 1000),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.customer_service_config_create_tiered(text, text, text, text, boolean, numeric, text, numeric, integer, boolean, boolean, text, numeric, numeric, integer) from public, anon, authenticated;
grant execute on function public.customer_service_config_create_tiered(text, text, text, text, boolean, numeric, text, numeric, integer, boolean, boolean, text, numeric, numeric, integer) to service_role;
