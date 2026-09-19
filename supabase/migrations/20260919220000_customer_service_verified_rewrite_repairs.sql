begin;

alter table public.customer_service_repair_proposals
  drop constraint if exists customer_service_repair_proposals_status_check;
alter table public.customer_service_repair_proposals
  add constraint customer_service_repair_proposals_status_check check (status in (
    'proposed', 'diagnosed', 'candidate', 'validating', 'eligible', 'ready', 'applying',
    'canary', 'active', 'applied', 'insufficient_evidence', 'unsupported_repair',
    'validation_failed', 'blocked', 'rejected', 'failed', 'rolled_back'
  ));

create table if not exists public.customer_service_verified_rewrite_repairs (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.customer_service_repair_proposals(id),
  environment text not null,
  query_key text not null check (length(query_key) between 2 and 400),
  faq_id uuid not null references public.customer_faqs(id),
  faq_hash text not null,
  status text not null check (status in ('canary', 'active', 'rolled_back')),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  rolled_back_at timestamptz
);
create unique index if not exists customer_service_verified_rewrite_active_key
  on public.customer_service_verified_rewrite_repairs(environment, query_key)
  where status in ('canary', 'active');
alter table public.customer_service_verified_rewrite_repairs enable row level security;
revoke all on public.customer_service_verified_rewrite_repairs from public, anon, authenticated;
grant select on public.customer_service_verified_rewrite_repairs to service_role;

-- Runtime only sees a rule while the original approved FAQ is still published
-- and byte-for-byte unchanged. The customer question is never used as an answer.
create or replace function public.customer_service_verified_rewrite(
  p_environment text, p_query text
) returns text language sql stable security definer
set search_path = pg_catalog, public as $$
  select faq.question
  from public.customer_service_verified_rewrite_repairs rule
  join public.customer_faqs faq on faq.id = rule.faq_id
  where rule.environment = p_environment
    and rule.query_key = regexp_replace(lower(btrim(p_query)), '[[:space:]?？!！,，。:：;；、]', '', 'g')
    and rule.status = 'active'
    and faq.is_published
    and faq.locale = 'zh-HK'
    and rule.faq_hash = md5(faq.question || chr(31) || faq.answer)
  order by rule.created_at desc limit 1;
$$;
revoke all on function public.customer_service_verified_rewrite(text,text) from public, anon, authenticated;
grant execute on function public.customer_service_verified_rewrite(text,text) to service_role;

create or replace function public.customer_service_verified_repair_target(p_faq_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  select jsonb_build_object('id', faq.id, 'question', faq.question,
    'category', faq.category, 'created_at', faq.created_at,
    'content_hash', md5(faq.question || chr(31) || faq.answer))
  from public.customer_faqs faq
  where faq.id=p_faq_id and faq.is_published and faq.locale='zh-HK';
$$;
revoke all on function public.customer_service_verified_repair_target(uuid) from public, anon, authenticated;
grant execute on function public.customer_service_verified_repair_target(uuid) to service_role;

create or replace function public.customer_service_apply_verified_rewrite(
  p_proposal_id uuid, p_environment text, p_config_fingerprint text
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_proposal public.customer_service_repair_proposals%rowtype;
  v_run public.customer_service_history_eval_runs%rowtype;
  v_faq public.customer_faqs%rowtype;
  v_rule uuid;
  v_key text;
begin
  select * into v_proposal from public.customer_service_repair_proposals
    where id = p_proposal_id for update;
  if v_proposal.id is null or v_proposal.environment <> p_environment
     or v_proposal.status <> 'eligible' or v_proposal.repair_kind <> 'alias_candidate'
     or v_proposal.preauthorized is distinct from true
     or v_proposal.validation->>'passed' <> 'true'
     or v_proposal.validation->>'gate_version' <> 'verified-faq-rewrite-v1'
     or v_proposal.validation->>'config_fingerprint' <> p_config_fingerprint then
    raise exception 'repair_not_eligible' using errcode = '22023';
  end if;
  select * into v_run from public.customer_service_history_eval_runs
    where id = (v_proposal.scope->>'run_id')::uuid;
  if v_run.id is null or v_run.environment <> p_environment
     or v_run.snapshot->>'config_fingerprint' <> p_config_fingerprint then
    raise exception 'repair_baseline_changed' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.customer_service_config_versions config
    where config.environment=p_environment and config.status='active'
      and config.id=(v_run.snapshot->>'config_id')::uuid
      and config.updated_at=(v_run.snapshot->>'config_updated_at')::timestamptz
  ) then
    raise exception 'repair_config_changed' using errcode = '22023';
  end if;
  select * into v_faq from public.customer_faqs
    where id = (v_proposal.candidate_patch->>'faq_id')::uuid;
  if v_faq.id is null or not v_faq.is_published or v_faq.locale <> 'zh-HK'
     or md5(v_faq.question || chr(31) || v_faq.answer) <> v_proposal.base_hash then
    raise exception 'repair_faq_changed' using errcode = '22023';
  end if;
  v_key := regexp_replace(lower(btrim(v_proposal.candidate_patch->>'question')),
    '[[:space:]?？!！,，。:：;；、]', '', 'g');
  if length(v_key) < 2 or length(v_key) > 400 then
    raise exception 'repair_query_invalid' using errcode = '22023';
  end if;
  insert into public.customer_service_verified_rewrite_repairs
    (proposal_id, environment, query_key, faq_id, faq_hash, status)
    values (p_proposal_id, p_environment, v_key, v_faq.id, v_proposal.base_hash, 'canary')
    returning id into v_rule;
  update public.customer_service_repair_proposals set status='canary',
    executed_by='history-auto-repair', executed_at=now(),
    rollback=jsonb_build_object('rule_id',v_rule), updated_at=now()
    where id=p_proposal_id;
  return v_rule;
end;
$$;
revoke all on function public.customer_service_apply_verified_rewrite(uuid,text,text) from public, anon, authenticated;
grant execute on function public.customer_service_apply_verified_rewrite(uuid,text,text) to service_role;

create or replace function public.customer_service_finish_verified_rewrite(
  p_proposal_id uuid, p_environment text, p_activate boolean
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_rule uuid;
begin
  select rule.id into v_rule
    from public.customer_service_verified_rewrite_repairs rule
    join public.customer_service_repair_proposals proposal on proposal.id=rule.proposal_id
    where rule.proposal_id=p_proposal_id and rule.environment=p_environment
      and rule.status in ('canary','active') and proposal.environment=p_environment
    for update of rule;
  if v_rule is null then return false; end if;
  if p_activate then
    if not exists (
      select 1 from public.customer_service_verified_rewrite_repairs rule
      join public.customer_service_repair_proposals proposal on proposal.id=rule.proposal_id
      join public.customer_service_history_eval_runs run
        on run.id=(proposal.scope->>'run_id')::uuid
      join public.customer_service_config_versions config
        on config.id=(run.snapshot->>'config_id')::uuid
      join public.customer_faqs faq on faq.id=rule.faq_id
      where rule.id=v_rule and rule.status='canary' and proposal.status='canary'
        and proposal.preauthorized and run.environment=p_environment
        and config.environment=p_environment and config.status='active'
        and config.updated_at=(run.snapshot->>'config_updated_at')::timestamptz
        and faq.is_published and faq.locale='zh-HK'
        and rule.faq_hash=md5(faq.question || chr(31) || faq.answer)
    ) then
      raise exception 'repair_baseline_changed' using errcode='22023';
    end if;
    update public.customer_service_verified_rewrite_repairs
      set status='active', activated_at=now() where id=v_rule and status='canary';
    update public.customer_service_repair_proposals
      set status='active', updated_at=now() where id=p_proposal_id and status='canary';
  else
    update public.customer_service_verified_rewrite_repairs
      set status='rolled_back', rolled_back_at=now() where id=v_rule;
    update public.customer_service_repair_proposals
      set status='rolled_back', rollback_at=now(), updated_at=now()
      where id=p_proposal_id and status in ('canary','active');
  end if;
  return true;
end;
$$;
revoke all on function public.customer_service_finish_verified_rewrite(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.customer_service_finish_verified_rewrite(uuid,text,boolean) to service_role;

commit;
