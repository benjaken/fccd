-- Turn the customer-note timeline into a real WATI conversation log.
alter table public.order_timeline_entries
  add column if not exists customer_phone_snapshot text,
  add column if not exists communication_channel text,
  add column if not exists message_direction text,
  add column if not exists provider_message_id text,
  add column if not exists provider_conversation_id text,
  add column if not exists delivery_status text;

alter table public.order_timeline_entries
  add constraint order_timeline_entries_message_direction_check
  check (message_direction is null or message_direction in ('inbound', 'outbound'));

create unique index if not exists order_timeline_entries_provider_message_id_uidx
  on public.order_timeline_entries(provider_message_id);

create index if not exists order_timeline_entries_customer_phone_idx
  on public.order_timeline_entries (
    regexp_replace(coalesce(customer_phone_snapshot, ''), '[^0-9]', '', 'g')
  );

comment on column public.order_timeline_entries.communication_channel is
  'External communication provider, currently wati for WhatsApp conversations.';
comment on column public.order_timeline_entries.message_direction is
  'Whether an external message was received from or sent to the customer.';
