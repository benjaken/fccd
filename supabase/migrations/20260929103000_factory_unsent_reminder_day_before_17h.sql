-- The factory-unsent internal reminder must fire once at 17:00 Hong Kong time on
-- the day before delivery, and only then. Previously the enqueue trigger set
-- scheduled_at = now(), so any order that still needed the factory would notify
-- immediately no matter how far out the delivery date was; the Edge worker then
-- pulled it forward again. Both sides now schedule to
-- (delivery_date - 1 day) 17:00 Asia/Hong_Kong and only send when the delivery
-- date is tomorrow.

create or replace function private.enqueue_internal_order_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_delivery_date date;
  v_scheduled_at timestamptz;
begin
  if new.document_type <> 'order'
    or new.archived_at is not null
    or private.wati_order_is_cancelled(new)
  then
    update public.order_internal_notification_outbox
    set status = 'skipped',
        last_error = case
          when private.wati_order_is_cancelled(new) then 'order_cancelled'
          else 'order_not_active'
        end,
        locked_at = null,
        updated_at = now()
    where order_id = new.id
      and sent_at is null
      and status in ('pending', 'processing', 'failed');
    return new;
  end if;

  if coalesce(new.is_sent_to_factory, false)
    or coalesce(new.do_not_send_to_factory, false)
  then
    update public.order_internal_notification_outbox
    set status = 'skipped',
        last_error = case
          when coalesce(new.is_sent_to_factory, false) then 'factory_already_sent'
          else 'factory_send_not_required'
        end,
        locked_at = null,
        updated_at = now()
    where order_id = new.id
      and sent_at is null
      and status in ('pending', 'processing', 'failed');
    return new;
  end if;

  -- Schedule for 17:00 Hong Kong time on the day before delivery. Orders with
  -- no delivery date are scheduled immediately; the Edge worker will reject
  -- them as delivery_schedule_missing.
  v_delivery_date := (new.delivery_at at time zone 'Asia/Hong_Kong')::date;
  if v_delivery_date is not null then
    v_scheduled_at := ((v_delivery_date - 1)::text || ' 17:00:00')::timestamp
      at time zone 'Asia/Hong_Kong';
  end if;

  insert into public.order_internal_notification_outbox (
    order_id, channel, recipient_key, recipient_name, recipient_address,
    scheduled_at
  )
  select
    new.id,
    'email',
    recipient.recipient_key,
    recipient.recipient_name,
    recipient.recipient_address,
    coalesce(v_scheduled_at, now())
  from private.order_email_notification_recipients() as recipient
  on conflict (order_id, channel, recipient_key) do update
  set scheduled_at = coalesce(v_scheduled_at, now()),
      status = 'pending',
      last_error = null,
      locked_at = null,
      updated_at = now()
  where order_internal_notification_outbox.sent_at is null;

  insert into public.order_internal_notification_outbox (
    order_id, channel, recipient_key, recipient_name, recipient_address,
    scheduled_at
  )
  select
    new.id,
    'whatsapp',
    recipient.id::text,
    recipient.name,
    recipient.phone,
    coalesce(v_scheduled_at, now())
  from public.order_first_notification_recipients as recipient
  on conflict (order_id, channel, recipient_key) do update
  set scheduled_at = coalesce(v_scheduled_at, now()),
      status = 'pending',
      last_error = null,
      locked_at = null,
      updated_at = now()
  where order_internal_notification_outbox.sent_at is null;

  return new;
end;
$$;

drop trigger if exists enqueue_internal_order_notifications on public.orders;
create trigger enqueue_internal_order_notifications
after insert or update of
  document_type, archived_at, delivery_at, delivery_time,
  is_sent_to_factory, do_not_send_to_factory,
  delivery_status, order_status_legacy_ids
on public.orders
for each row execute function private.enqueue_internal_order_notifications();

-- Re-schedule any still-pending reminders of active, factory-unsent orders to
-- their correct (delivery_date - 1 day) 17:00 slot, clearing tasks created by
-- the previous immediate-send behavior. Rows already sent are left untouched.
update public.order_internal_notification_outbox as outbox
set scheduled_at = coalesce(
      (((orders.delivery_at at time zone 'Asia/Hong_Kong')::date - 1)::text
        || ' 17:00:00')::timestamp at time zone 'Asia/Hong_Kong',
      now()
    ),
    status = 'pending',
    last_error = null,
    locked_at = null,
    updated_at = now()
from public.orders as orders
where orders.id = outbox.order_id
  and outbox.sent_at is null
  and outbox.status in ('pending', 'processing', 'failed')
  and orders.document_type = 'order'
  and orders.archived_at is null
  and not private.wati_order_is_cancelled(orders)
  and not coalesce(orders.is_sent_to_factory, false)
  and not coalesce(orders.do_not_send_to_factory, false);
