alter table public.customer_service_conversations
  add column if not exists active_goal text,
  add column if not exists workflow_slots jsonb not null default '{}'::jsonb,
  add column if not exists workflow_version integer not null default 1;

alter table public.customer_service_conversations
  drop constraint if exists customer_service_conversations_active_goal_check;
alter table public.customer_service_conversations
  add constraint customer_service_conversations_active_goal_check
  check (active_goal is null or active_goal in ('order_change', 'catering_inquiry'));

update public.customer_service_conversations
set active_goal = case
  when state = 'collecting' then 'catering_inquiry'
  when state = 'picking_handoff_order' then 'order_change'
  when state = 'verifying_order' and pending_request like 'handoff:%' then 'order_change'
  when state = 'awaiting_human' and selected_order_id is not null then 'order_change'
  else active_goal
end
where active_goal is null;

comment on column public.customer_service_conversations.active_goal is
  'Pilot workflow currently active for contextual continue, cancel, and task switching.';
comment on column public.customer_service_conversations.workflow_slots is
  'Persisted non-sensitive workflow fields. Identity verification answers must never be stored here.';
