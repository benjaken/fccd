-- Auditable WhatsApp customer-service turns, daily AI reports, and
-- human-reviewed learning suggestions.

create table if not exists public.customer_service_turns (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  phone_normalized text not null,
  question text not null default '',
  answer text,
  intent text,
  route text,
  state_before text,
  state_after text,
  used_model boolean not null default false,
  model text,
  faq_source_ids uuid[] not null default '{}',
  wrote_inquiry boolean not null default false,
  notified_internal boolean not null default false,
  human_handoff boolean not null default false,
  reply_attempted boolean not null default false,
  reply_sent boolean not null default false,
  delivery_status text not null default 'not_attempted',
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'replied', 'handoff', 'unanswered', 'skipped', 'failed')),
  failure_reason text,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  environment text not null default 'production',
  ai_outcome text check (ai_outcome is null or ai_outcome in ('success', 'failure', 'needs_review')),
  ai_score numeric(5,4) check (ai_score is null or (ai_score >= 0 and ai_score <= 1)),
  ai_reason text,
  evaluated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists customer_service_turns_created_idx
  on public.customer_service_turns (created_at desc);
create index if not exists customer_service_turns_reporting_idx
  on public.customer_service_turns (environment, processing_status, created_at desc);
create index if not exists customer_service_turns_intent_idx
  on public.customer_service_turns (intent, created_at desc);

create table if not exists public.customer_service_daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  environment text not null default 'production',
  period_start timestamptz not null,
  period_end timestamptz not null,
  metrics jsonb not null default '{}'::jsonb,
  top_intents jsonb not null default '[]'::jsonb,
  failure_themes jsonb not null default '[]'::jsonb,
  ai_summary text not null default '',
  model text,
  prompt_version text not null default 'customer-service-daily/1',
  status text not null default 'pending'
    check (status in ('pending', 'complete', 'partial', 'failed')),
  error text,
  generated_at timestamptz not null default now(),
  unique (report_date, environment)
);

create index if not exists customer_service_daily_reports_date_idx
  on public.customer_service_daily_reports (environment, report_date desc);

create table if not exists public.customer_service_learning_suggestions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.customer_service_daily_reports(id) on delete cascade,
  suggestion_type text not null check (suggestion_type in ('faq', 'intent', 'policy')),
  title text not null,
  reason text not null default '',
  proposed_content jsonb not null default '{}'::jsonb,
  evidence_turn_ids uuid[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'rejected', 'published')),
  target_faq_id uuid references public.customer_faqs(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_service_learning_suggestions_status_idx
  on public.customer_service_learning_suggestions (status, created_at desc);

alter table public.customer_service_turns enable row level security;
alter table public.customer_service_daily_reports enable row level security;
alter table public.customer_service_learning_suggestions enable row level security;

revoke all on table public.customer_service_turns from public, anon, authenticated;
revoke all on table public.customer_service_daily_reports from public, anon, authenticated;
revoke all on table public.customer_service_learning_suggestions from public, anon, authenticated;
grant all on table public.customer_service_turns to service_role;
grant all on table public.customer_service_daily_reports to service_role;
grant all on table public.customer_service_learning_suggestions to service_role;

create or replace function public.customer_service_daily_reports_list(p_limit integer default 14)
returns table (
  id uuid,
  report_date date,
  environment text,
  metrics jsonb,
  top_intents jsonb,
  failure_themes jsonb,
  ai_summary text,
  model text,
  status text,
  error text,
  generated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
    select
      reports.id,
      reports.report_date,
      reports.environment,
      reports.metrics,
      reports.top_intents,
      reports.failure_themes,
      reports.ai_summary,
      reports.model,
      reports.status,
      reports.error,
      reports.generated_at
    from public.customer_service_daily_reports reports
    order by reports.report_date desc, reports.generated_at desc
    limit greatest(1, least(coalesce(p_limit, 14), 90));
end;
$$;

create or replace function public.customer_service_learning_suggestions_list(
  p_status text default 'draft',
  p_limit integer default 50
)
returns table (
  id uuid,
  report_id uuid,
  report_date date,
  suggestion_type text,
  title text,
  reason text,
  proposed_content jsonb,
  evidence_count integer,
  status text,
  target_faq_id uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
    select
      suggestions.id,
      suggestions.report_id,
      reports.report_date,
      suggestions.suggestion_type,
      suggestions.title,
      suggestions.reason,
      suggestions.proposed_content,
      coalesce(array_length(suggestions.evidence_turn_ids, 1), 0),
      suggestions.status,
      suggestions.target_faq_id,
      suggestions.created_at
    from public.customer_service_learning_suggestions suggestions
    join public.customer_service_daily_reports reports on reports.id = suggestions.report_id
    where p_status is null or suggestions.status = p_status
    order by suggestions.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

create or replace function public.customer_service_learning_suggestion_review(
  p_id uuid,
  p_status text
)
returns table (
  suggestion_id uuid,
  suggestion_status text,
  target_faq_id uuid
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_suggestion public.customer_service_learning_suggestions%rowtype;
  v_question text;
  v_answer text;
  v_category text;
  v_keywords text;
  v_faq_id uuid;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid_suggestion_status' using errcode = '22023';
  end if;

  select * into v_suggestion
  from public.customer_service_learning_suggestions
  where id = p_id
  for update;
  if not found then
    raise exception 'suggestion_not_found' using errcode = 'P0002';
  end if;
  if v_suggestion.status <> 'draft' then
    raise exception 'suggestion_already_reviewed' using errcode = '55000';
  end if;

  if p_status = 'approved' and v_suggestion.suggestion_type = 'faq' then
    v_question := btrim(coalesce(v_suggestion.proposed_content->>'question', ''));
    v_answer := btrim(coalesce(v_suggestion.proposed_content->>'answer', ''));
    v_category := btrim(coalesce(v_suggestion.proposed_content->>'category', 'ordering'));
    v_keywords := btrim(coalesce(v_suggestion.proposed_content->>'keywords', ''));
    if v_category not in ('ordering', 'delivery', 'payment', 'membership', 'menu') then
      v_category := 'ordering';
    end if;
    if v_question <> '' and v_answer <> '' then
      insert into public.customer_faqs (
        category, question, answer, keywords, locale, is_published, sort_order
      ) values (
        v_category, v_question, v_answer, v_keywords, 'zh-HK', false, 0
      )
      on conflict (locale, question) do nothing
      returning id into v_faq_id;
      if v_faq_id is null then
        select faqs.id into v_faq_id
        from public.customer_faqs faqs
        where faqs.locale = 'zh-HK' and faqs.question = v_question
        limit 1;
      end if;
    end if;
  end if;

  update public.customer_service_learning_suggestions
  set
    status = p_status,
    target_faq_id = coalesce(v_faq_id, target_faq_id),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_id;

  return query
    select p_id, p_status, coalesce(v_faq_id, v_suggestion.target_faq_id);
end;
$$;

revoke all on function public.customer_service_daily_reports_list(integer) from public, anon;
revoke all on function public.customer_service_learning_suggestions_list(text, integer) from public, anon;
revoke all on function public.customer_service_learning_suggestion_review(uuid, text) from public, anon;
grant execute on function public.customer_service_daily_reports_list(integer) to authenticated;
grant execute on function public.customer_service_learning_suggestions_list(text, integer) to authenticated;
grant execute on function public.customer_service_learning_suggestion_review(uuid, text) to authenticated;
