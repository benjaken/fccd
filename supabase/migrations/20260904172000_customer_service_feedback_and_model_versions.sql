-- Phase 2/3: trusted human feedback plus versioned model/prompt releases.

create table if not exists public.customer_service_turn_feedback (
  turn_id uuid primary key references public.customer_service_turns(id) on delete cascade,
  verdict text not null check (verdict in ('correct', 'incorrect', 'needs_review')),
  failure_category text,
  corrected_answer text,
  note text,
  learned_faq_id uuid references public.customer_faqs(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_service_config_versions (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'develop',
  version integer not null,
  label text not null,
  model text not null,
  system_prompt text not null default '',
  temperature numeric(3,2) not null default 0.10 check (temperature between 0 and 1),
  retrieval_limit integer not null default 3 check (retrieval_limit between 1 and 20),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, version)
);

create unique index if not exists customer_service_config_one_active_idx
  on public.customer_service_config_versions (environment)
  where status = 'active';

create table if not exists public.customer_service_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'develop',
  candidate_config_id uuid not null references public.customer_service_config_versions(id) on delete restrict,
  baseline_config_id uuid references public.customer_service_config_versions(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'running', 'complete', 'failed')),
  sample_size integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  comparison jsonb not null default '{}'::jsonb,
  error text,
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.customer_service_turn_feedback enable row level security;
alter table public.customer_service_config_versions enable row level security;
alter table public.customer_service_evaluation_runs enable row level security;

revoke all on table public.customer_service_turn_feedback from public, anon, authenticated;
revoke all on table public.customer_service_config_versions from public, anon, authenticated;
revoke all on table public.customer_service_evaluation_runs from public, anon, authenticated;
grant all on table public.customer_service_turn_feedback to service_role;
grant all on table public.customer_service_config_versions to service_role;
grant all on table public.customer_service_evaluation_runs to service_role;

create or replace function public.customer_service_turns_review_list(
  p_review_state text default 'unreviewed',
  p_limit integer default 50
)
returns table (
  id uuid, created_at timestamptz, question text, answer text, intent text, route text,
  processing_status text, ai_outcome text, ai_reason text, verdict text,
  failure_category text, corrected_answer text, note text, reviewed_at timestamptz
)
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
    select t.id, t.created_at, t.question, t.answer, t.intent, t.route,
      t.processing_status, t.ai_outcome, t.ai_reason, f.verdict,
      f.failure_category, f.corrected_answer, f.note, f.reviewed_at
    from public.customer_service_turns t
    left join public.customer_service_turn_feedback f on f.turn_id = t.id
    where case
      when p_review_state = 'unreviewed' then f.turn_id is null
      when p_review_state = 'reviewed' then f.turn_id is not null
      else true
    end
    order by t.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

create or replace function public.customer_service_turn_feedback_submit(
  p_turn_id uuid,
  p_verdict text,
  p_failure_category text default null,
  p_corrected_answer text default null,
  p_note text default null,
  p_create_faq_draft boolean default false
)
returns table (turn_id uuid, verdict text, learned_faq_id uuid)
language plpgsql security definer set search_path = public, private
as $$
declare
  v_turn public.customer_service_turns%rowtype;
  v_faq_id uuid;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_verdict not in ('correct', 'incorrect', 'needs_review') then
    raise exception 'invalid_feedback_verdict' using errcode = '22023';
  end if;
  select * into v_turn from public.customer_service_turns where id = p_turn_id;
  if not found then raise exception 'turn_not_found' using errcode = 'P0002'; end if;

  if p_create_faq_draft and p_verdict = 'incorrect'
     and btrim(coalesce(p_corrected_answer, '')) <> '' then
    insert into public.customer_faqs(category, question, answer, keywords, locale, is_published, sort_order)
    values ('ordering', v_turn.question, btrim(p_corrected_answer), '', 'zh-HK', false, 0)
    on conflict (locale, question) do update
      set answer = excluded.answer, is_published = false, updated_at = now()
    returning id into v_faq_id;
  end if;

  insert into public.customer_service_turn_feedback(
    turn_id, verdict, failure_category, corrected_answer, note,
    learned_faq_id, reviewed_by, reviewed_at, updated_at
  ) values (
    p_turn_id, p_verdict, nullif(btrim(coalesce(p_failure_category, '')), ''),
    nullif(btrim(coalesce(p_corrected_answer, '')), ''), nullif(btrim(coalesce(p_note, '')), ''),
    v_faq_id, auth.uid(), now(), now()
  )
  on conflict (turn_id) do update set
    verdict = excluded.verdict,
    failure_category = excluded.failure_category,
    corrected_answer = excluded.corrected_answer,
    note = excluded.note,
    learned_faq_id = coalesce(excluded.learned_faq_id, customer_service_turn_feedback.learned_faq_id),
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now();

  update public.customer_service_turns set
    ai_outcome = case p_verdict when 'correct' then 'success' when 'incorrect' then 'failure' else 'needs_review' end,
    ai_reason = coalesce(nullif(btrim(coalesce(p_note, '')), ''), ai_reason),
    evaluated_at = now()
  where id = p_turn_id;

  return query select p_turn_id, p_verdict,
    (select f.learned_faq_id from public.customer_service_turn_feedback f where f.turn_id = p_turn_id);
end;
$$;

create or replace function public.customer_service_config_versions_list(p_environment text default null)
returns table (
  id uuid, environment text, version integer, label text, model text, system_prompt text,
  temperature numeric, retrieval_limit integer, status text, activated_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query select c.id, c.environment, c.version, c.label, c.model, c.system_prompt,
    c.temperature, c.retrieval_limit, c.status, c.activated_at, c.created_at
  from public.customer_service_config_versions c
  where p_environment is null or c.environment = p_environment
  order by c.environment, c.version desc;
end;
$$;

create or replace function public.customer_service_config_create(
  p_environment text, p_label text, p_model text, p_system_prompt text default '',
  p_temperature numeric default 0.10, p_retrieval_limit integer default 3
)
returns uuid
language plpgsql security definer set search_path = public, private
as $$
declare v_id uuid;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if btrim(coalesce(p_model, '')) = '' then raise exception 'model_required' using errcode = '22023'; end if;
  insert into public.customer_service_config_versions(
    environment, version, label, model, system_prompt, temperature, retrieval_limit, created_by
  ) values (
    coalesce(nullif(btrim(p_environment), ''), 'develop'),
    coalesce((select max(c.version) + 1 from public.customer_service_config_versions c
      where c.environment = coalesce(nullif(btrim(p_environment), ''), 'develop')), 1),
    coalesce(nullif(btrim(p_label), ''), 'Draft'), btrim(p_model), coalesce(p_system_prompt, ''),
    greatest(0, least(coalesce(p_temperature, 0.10), 1)),
    greatest(1, least(coalesce(p_retrieval_limit, 3), 20)), auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.customer_service_config_activate(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public, private
as $$
declare v_environment text;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  select environment into v_environment from public.customer_service_config_versions where id = p_id for update;
  if not found then raise exception 'config_not_found' using errcode = 'P0002'; end if;
  update public.customer_service_config_versions set status = 'archived', updated_at = now()
    where environment = v_environment and status = 'active' and id <> p_id;
  update public.customer_service_config_versions set status = 'active', activated_by = auth.uid(),
    activated_at = now(), updated_at = now() where id = p_id;
  return p_id;
end;
$$;

create or replace function public.customer_service_evaluation_runs_list(p_limit integer default 20)
returns table (
  id uuid, environment text, candidate_config_id uuid, baseline_config_id uuid,
  candidate_label text, candidate_model text, status text, sample_size integer,
  metrics jsonb, comparison jsonb, error text, created_at timestamptz, completed_at timestamptz
)
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query select r.id, r.environment, r.candidate_config_id, r.baseline_config_id,
    c.label, c.model, r.status, r.sample_size, r.metrics, r.comparison, r.error,
    r.created_at, r.completed_at
  from public.customer_service_evaluation_runs r
  join public.customer_service_config_versions c on c.id = r.candidate_config_id
  order by r.created_at desc limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all on function public.customer_service_turns_review_list(text, integer) from public, anon;
revoke all on function public.customer_service_turn_feedback_submit(uuid, text, text, text, text, boolean) from public, anon;
revoke all on function public.customer_service_config_versions_list(text) from public, anon;
revoke all on function public.customer_service_config_create(text, text, text, text, numeric, integer) from public, anon;
revoke all on function public.customer_service_config_activate(uuid) from public, anon;
revoke all on function public.customer_service_evaluation_runs_list(integer) from public, anon;
grant execute on function public.customer_service_turns_review_list(text, integer) to authenticated;
grant execute on function public.customer_service_turn_feedback_submit(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.customer_service_config_versions_list(text) to authenticated;
grant execute on function public.customer_service_config_create(text, text, text, text, numeric, integer) to authenticated;
grant execute on function public.customer_service_config_activate(uuid) to authenticated;
grant execute on function public.customer_service_evaluation_runs_list(integer) to authenticated;
