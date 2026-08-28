-- Replace immediate new-order messages with an internal reminder that becomes
-- eligible 12 hours before the order's delivery-window start. Exact cutoff
-- calculation and the final is_sent_to_factory check live in the Edge worker.

create or replace function private.enqueue_internal_order_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.document_type <> 'order' or new.archived_at is not null then
    update public.order_internal_notification_outbox
    set status = 'skipped',
        last_error = 'order_not_active',
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

  insert into public.order_internal_notification_outbox (
    order_id, channel, recipient_key, recipient_name, recipient_address,
    scheduled_at
  )
  select
    new.id,
    'email',
    profile.id::text,
    coalesce(nullif(btrim(profile.user_name), ''), profile.email),
    btrim(profile.email),
    now()
  from public.user_profiles as profile
  where profile.email_noti
    and nullif(btrim(profile.email), '') is not null
  on conflict (order_id, channel, recipient_key) do update
  set scheduled_at = now(),
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
    now()
  from public.order_first_notification_recipients as recipient
  on conflict (order_id, channel, recipient_key) do update
  set scheduled_at = now(),
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
  is_sent_to_factory, do_not_send_to_factory
on public.orders
for each row execute function private.enqueue_internal_order_notifications();

-- Convert previous immediate-notification rows into the new T-12 reminder for
-- active, upcoming orders that still need to be sent to the factory.
update public.order_internal_notification_outbox as outbox
set scheduled_at = now(),
    status = 'pending',
    attempts = 0,
    sent_at = null,
    provider_response = null,
    last_error = null,
    locked_at = null,
    updated_at = now()
where exists (
  select 1
  from public.orders as orders
  where orders.id = outbox.order_id
    and orders.document_type = 'order'
    and orders.archived_at is null
    and not coalesce(orders.is_sent_to_factory, false)
    and not coalesce(orders.do_not_send_to_factory, false)
    and (orders.delivery_at at time zone 'Asia/Hong_Kong')::date
        >= (now() at time zone 'Asia/Hong_Kong')::date
);

-- Fire the new trigger once so active orders without a prior outbox row also
-- receive both email and WATI reminder rows.
update public.orders
set delivery_time = delivery_time
where document_type = 'order'
  and archived_at is null
  and not coalesce(is_sent_to_factory, false)
  and not coalesce(do_not_send_to_factory, false)
  and (delivery_at at time zone 'Asia/Hong_Kong')::date
      >= (now() at time zone 'Asia/Hong_Kong')::date;
