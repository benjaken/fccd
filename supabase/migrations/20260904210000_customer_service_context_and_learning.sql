alter table public.customer_service_conversations
  add column if not exists suspended_goals jsonb not null default '[]'::jsonb;

alter table public.customer_service_turns
  add column if not exists dialog_action text,
  add column if not exists active_goal text,
  add column if not exists context_message_count integer not null default 0;

create table if not exists public.customer_service_messages (
  id uuid primary key default gen_random_uuid(),
  source_message_id text not null,
  phone_normalized text not null,
  conversation_id text generated always as (phone_normalized) stored,
  role text not null check (role in ('customer', 'assistant', 'human')),
  message_text text not null default '',
  intent_key text,
  dialog_action text,
  environment text not null default 'production',
  created_at timestamptz not null default now(),
  unique (source_message_id, role)
);
create index if not exists customer_service_messages_context_idx
  on public.customer_service_messages (phone_normalized, created_at desc);

create table if not exists public.customer_service_workflow_policies (
  goal_key text primary key check (goal_key in ('order_change', 'catering_inquiry')),
  display_name text not null,
  instructions text not null default '',
  context_window integer not null default 8 check (context_window between 1 and 12),
  clarification_threshold numeric(4,3) not null default 0.72
    check (clarification_threshold between 0 and 1),
  auto_resume boolean not null default true,
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.customer_service_workflow_policies
  (goal_key, display_name, instructions)
values
  ('order_change', '訂單修改', '先選擇未送貨訂單，完成身份核實後建立人工跟進；不得直接修改訂單。'),
  ('catering_inquiry', '訂餐／到會', '逐步收集日期、人數、預算、飲食要求及菜式偏好，再建立跟進。')
on conflict (goal_key) do nothing;

create table if not exists public.customer_service_test_cases (
  id uuid primary key default gen_random_uuid(),
  source_turn_id uuid unique references public.customer_service_turns(id) on delete set null,
  name text not null,
  messages jsonb not null default '[]'::jsonb,
  expected_intent text,
  expected_dialog_action text,
  expected_answer text,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_service_test_cases_status_idx
  on public.customer_service_test_cases (status, created_at desc);

alter table public.customer_service_messages enable row level security;
alter table public.customer_service_workflow_policies enable row level security;
alter table public.customer_service_test_cases enable row level security;
revoke all on table public.customer_service_messages from public, anon, authenticated;
revoke all on table public.customer_service_workflow_policies from public, anon;
revoke all on table public.customer_service_test_cases from public, anon, authenticated;
grant all on table public.customer_service_messages to service_role;
grant select, update on table public.customer_service_workflow_policies to authenticated;
grant all on table public.customer_service_workflow_policies to service_role;
grant all on table public.customer_service_test_cases to service_role;

drop policy if exists "Customer service workflow readers" on public.customer_service_workflow_policies;
create policy "Customer service workflow readers"
  on public.customer_service_workflow_policies for select to authenticated
  using (private.has_page_access('settings.customer_faq'));
drop policy if exists "Customer service workflow editors" on public.customer_service_workflow_policies;
create policy "Customer service workflow editors"
  on public.customer_service_workflow_policies for update to authenticated
  using (private.has_page_access('settings.customer_faq.edit'))
  with check (private.has_page_access('settings.customer_faq.edit'));

create or replace function public.customer_service_feedback_sync_test_case()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare v_turn public.customer_service_turns%rowtype; v_messages jsonb;
begin
  if not new.include_in_learning then return new; end if;
  select * into v_turn from public.customer_service_turns where id = new.turn_id;
  if not found then return new; end if;
  select coalesce(jsonb_agg(jsonb_build_object('role', q.role, 'text', q.message_text)
    order by q.created_at), '[]'::jsonb) into v_messages
  from (
    select role, message_text, created_at
    from public.customer_service_messages
    where phone_normalized = v_turn.phone_normalized and created_at <= v_turn.created_at
    order by created_at desc limit 8
  ) q;
  if jsonb_array_length(v_messages) = 0 then
    v_messages := jsonb_build_array(jsonb_build_object('role', 'customer', 'text', v_turn.question));
  end if;
  insert into public.customer_service_test_cases(
    source_turn_id, name, messages, expected_intent, expected_dialog_action,
    expected_answer, status, created_by, updated_at
  ) values (
    new.turn_id, left(v_turn.question, 120), v_messages, v_turn.intent, null,
    case when new.verdict = 'incorrect' then new.corrected_answer else v_turn.answer end,
    'active', auth.uid(), now()
  ) on conflict (source_turn_id) do update set
    messages = excluded.messages,
    expected_intent = excluded.expected_intent,
    expected_answer = excluded.expected_answer,
    status = 'active', updated_at = now();
  return new;
end;
$$;

drop trigger if exists customer_service_feedback_sync_test_case_trigger
  on public.customer_service_turn_feedback;
create trigger customer_service_feedback_sync_test_case_trigger
after insert or update of include_in_learning, corrected_answer, verdict
on public.customer_service_turn_feedback
for each row execute function public.customer_service_feedback_sync_test_case();

create or replace function public.customer_service_test_cases_list(p_limit integer default 100)
returns table (
  id uuid, name text, messages jsonb, expected_intent text,
  expected_dialog_action text, expected_answer text, status text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query select t.id, t.name, t.messages, t.expected_intent,
    t.expected_dialog_action, t.expected_answer, t.status, t.created_at
  from public.customer_service_test_cases t
  order by t.created_at desc limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function public.customer_service_conversation_set_mode(p_phone text, p_mode text)
returns text language plpgsql security definer set search_path = public, private
as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if v_phone = '' or p_mode not in ('human', 'bot') then
    raise exception 'invalid_conversation_mode' using errcode = '22023';
  end if;
  insert into public.customer_service_conversations(
    phone_normalized, state, selected_order_id, handoff_at, pending_request,
    active_goal, workflow_slots, suspended_goals, updated_at
  ) values (
    v_phone, case when p_mode = 'human' then 'human_owned' else 'identifying' end,
    null, case when p_mode = 'human' then now() else null end, null,
    null, '{}'::jsonb, '[]'::jsonb, now()
  ) on conflict (phone_normalized) do update set
    state = excluded.state, selected_order_id = null, handoff_at = excluded.handoff_at,
    pending_request = null, active_goal = null, workflow_slots = '{}'::jsonb,
    suspended_goals = '[]'::jsonb, identity_verified_at = null,
    identity_verification_method = null, identity_verification_order_id = null,
    identity_verification_attempts = 0, updated_at = now();
  if p_mode = 'human' then
    update public.customer_service_handoff_requests set status = 'in_progress',
      claimed_at = now(), claimed_by = auth.uid(), updated_at = now()
    where phone_normalized = v_phone and status in ('pending','processing','notified','failed');
  else
    update public.customer_service_handoff_requests set status = 'resolved',
      resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
    where phone_normalized = v_phone and status in ('pending','processing','notified','in_progress','failed');
  end if;
  return p_mode;
end;
$$;

revoke all on function public.customer_service_test_cases_list(integer) from public, anon;
grant execute on function public.customer_service_test_cases_list(integer) to authenticated;
