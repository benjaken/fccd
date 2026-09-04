alter table public.customer_service_conversations
  add column if not exists pending_request text;

alter table public.customer_service_conversations
  drop constraint if exists customer_service_conversations_state_check;

alter table public.customer_service_conversations
  add constraint customer_service_conversations_state_check
  check (state in (
    'identifying',
    'picking_order',
    'picking_handoff_order',
    'collecting',
    'human_owned'
  ));
