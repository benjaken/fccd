-- Route most customer-service work through Grok 4.3 without reasoning and
-- escalate only uncertain requests to Grok 4.5 with low reasoning.

alter table public.customer_service_config_versions
  add column if not exists fallback_model text not null default 'grok-4.5',
  add column if not exists fallback_enabled boolean not null default true,
  add column if not exists escalation_confidence numeric(3,2) not null default 0.72
    check (escalation_confidence between 0 and 1);

update public.customer_service_config_versions
set model = 'grok-4.3',
    fallback_model = 'grok-4.5',
    fallback_enabled = true,
    escalation_confidence = 0.72,
    updated_at = now()
where environment = 'develop' and status = 'active';

drop function if exists public.customer_service_config_versions_list(text);

create function public.customer_service_config_versions_list(p_environment text default null)
returns table (
  id uuid, environment text, version integer, label text, model text,
  fallback_model text, fallback_enabled boolean, escalation_confidence numeric,
  system_prompt text, temperature numeric, retrieval_limit integer, status text,
  activated_at timestamptz, created_at timestamptz
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
      c.system_prompt, c.temperature, c.retrieval_limit, c.status,
      c.activated_at, c.created_at
    from public.customer_service_config_versions c
    where p_environment is null or c.environment = p_environment
    order by c.environment, c.version desc;
end;
$$;

create or replace function public.customer_service_config_create_tiered(
  p_environment text,
  p_label text,
  p_model text,
  p_fallback_model text default 'grok-4.5',
  p_fallback_enabled boolean default true,
  p_escalation_confidence numeric default 0.72,
  p_system_prompt text default '',
  p_temperature numeric default 0.10,
  p_retrieval_limit integer default 3
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
    escalation_confidence, system_prompt, temperature, retrieval_limit, created_by
  ) values (
    coalesce(nullif(btrim(p_environment), ''), 'develop'),
    coalesce((select max(c.version) + 1 from public.customer_service_config_versions c
      where c.environment = coalesce(nullif(btrim(p_environment), ''), 'develop')), 1),
    coalesce(nullif(btrim(p_label), ''), 'Draft'),
    btrim(p_model),
    coalesce(nullif(btrim(p_fallback_model), ''), 'grok-4.5'),
    coalesce(p_fallback_enabled, true),
    greatest(0, least(coalesce(p_escalation_confidence, 0.72), 1)),
    coalesce(p_system_prompt, ''),
    greatest(0, least(coalesce(p_temperature, 0.10), 1)),
    greatest(1, least(coalesce(p_retrieval_limit, 3), 20)),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.customer_service_config_versions_list(text) from public, anon;
revoke all on function public.customer_service_config_create_tiered(
  text, text, text, text, boolean, numeric, text, numeric, integer
) from public, anon;
grant execute on function public.customer_service_config_versions_list(text) to authenticated;
grant execute on function public.customer_service_config_create_tiered(
  text, text, text, text, boolean, numeric, text, numeric, integer
) to authenticated;

