-- Make the tiered defaults visible and editable in the develop model lab.
insert into public.customer_service_config_versions (
  environment, version, label, model, fallback_model, fallback_enabled,
  escalation_confidence, system_prompt, temperature, retrieval_limit, status,
  activated_at, created_at, updated_at
)
select
  'develop',
  coalesce((select max(version) + 1 from public.customer_service_config_versions where environment = 'develop'), 1),
  'Develop tiered default',
  'grok-4.3',
  'grok-4.5',
  true,
  0.72,
  '',
  0.10,
  3,
  'active',
  now(),
  now(),
  now()
where not exists (
  select 1 from public.customer_service_config_versions
  where environment = 'develop' and status = 'active'
);

