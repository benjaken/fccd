begin;

alter table public.customer_service_conversation_mode_events
  drop constraint if exists customer_service_conversation_mode_events_source_check;

alter table public.customer_service_conversation_mode_events
  add constraint customer_service_conversation_mode_events_source_check
  check (source in ('backend', 'wati_operator', 'system', 'order_inquiry_queue'));

comment on constraint customer_service_conversation_mode_events_source_check
  on public.customer_service_conversation_mode_events is
  'Identifies whether a conversation mode transition came from the backend, WATI, the system, or the WATI pending-work queue.';

commit;
