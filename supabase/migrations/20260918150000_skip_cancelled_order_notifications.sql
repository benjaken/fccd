-- Cancelled orders must never trigger an automatic notification. Cancelling a
-- delivery only flips delivery_status (`cancel_order_delivery` does not archive
-- the order and does not clear delivery_at), so the same-day reminder cron and
-- the internal factory-unsent reminders kept treating the order as active.
--
-- This guards the enqueue path, the reminder sweep, and any rows that were
-- already queued when the delivery was cancelled.

create or replace function private.wati_order_is_cancelled(p_order public.orders)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_order.delivery_status, '') ~* '(cancel|取消)';
$$;

comment on function private.wati_order_is_cancelled(public.orders) is
  'True when the order delivery status marks the delivery as cancelled.';

-- Same automatic customer-event allowlist as
-- 20260902090000_only_same_day_customer_notifications, plus a cancellation
-- guard so no future automatic event can be queued for a cancelled order.
create or replace function private.enqueue_wati_order_event(
  p_order_id uuid,
  p_event_key text,
  p_occurrence_key text
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_order public.orders%rowtype;
  v_inserted integer;
begin
  if p_event_key not in ('delivery_today_reminder', 'pickup_today_reminder') then
    return 0;
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null or private.wati_order_is_cancelled(v_order) then
    return 0;
  end if;

  insert into public.wati_order_notification_outbox (
    order_id, template_id, event_key, occurrence_key
  )
  select p_order_id, template.id, template.event_key, p_occurrence_key
  from public.wati_order_notification_templates template
  where template.event_key = p_event_key
    and template.is_active
  on conflict (order_id, template_id, occurrence_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function private.enqueue_wati_order_event(uuid, text, text) is
  'Queues only same-day delivery/pickup reminders and never for cancelled orders.';

-- Same-day delivery and self-pick reminder sweep. Exclude cancelled deliveries
-- so a 取消 order with a same-day delivery_at is no longer queued.
create or replace function public.enqueue_due_wati_order_reminders(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_order public.orders%rowtype;
  v_local_date date := (p_now at time zone 'Asia/Hong_Kong')::date;
  v_delivery_date date;
  v_method text;
  v_event_key text;
  v_count integer := 0;
begin
  for v_order in
    select orders.*
    from public.orders orders
    where orders.document_type = 'order'
      and orders.archived_at is null
      and not private.wati_order_is_cancelled(orders)
      and not private.wati_order_is_pending_review(orders)
      and (orders.delivery_at at time zone 'Asia/Hong_Kong')::date
          in (v_local_date, v_local_date + 1)
  loop
    v_delivery_date := (v_order.delivery_at at time zone 'Asia/Hong_Kong')::date;
    v_method := private.wati_delivery_method(v_order);

    if v_method = 'delivery' then
      if p_now < private.wati_delivery_reminder_at(v_order) then continue; end if;
      v_event_key := 'delivery_today_reminder';
    elsif v_delivery_date <> v_local_date then
      continue;
    elsif p_now < ((v_delivery_date + time '09:00') at time zone 'Asia/Hong_Kong') then
      continue;
    else
      v_event_key := 'pickup_today_reminder';
    end if;

    v_count := v_count + private.enqueue_wati_order_event(
      v_order.id,
      v_event_key,
      v_event_key || ':' || v_delivery_date::text
    );
  end loop;
  return v_count;
end;
$$;

revoke all on function public.enqueue_due_wati_order_reminders(timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_due_wati_order_reminders(timestamptz)
  to service_role;

-- Internal factory-unsent reminders must treat a cancelled order like an
-- inactive order and clear anything already queued.
create or replace function private.enqueue_internal_order_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.document_type <> 'order'
     or new.archived_at is not null
     or private.wati_order_is_cancelled(new)
  then
    update public.order_internal_notification_outbox
    set status = 'skipped',
        last_error = case when private.wati_order_is_cancelled(new)
          then 'order_cancelled' else 'order_not_active' end,
        locked_at = null,
        updated_at = now()
    where order_id = new.id
      and sent_at is null
      and status in ('pending', 'processing', 'failed');
    return new;
  end if;

  if coalesce(new.is_sent_to_factory, false) or coalesce(new.do_not_send_to_factory, false) then
    update public.order_internal_notification_outbox
    set status = 'skipped',
        last_error = case when coalesce(new.is_sent_to_factory, false)
          then 'factory_already_sent' else 'factory_send_not_required' end,
        locked_at = null, updated_at = now()
    where order_id = new.id and sent_at is null and status in ('pending', 'processing', 'failed');
    return new;
  end if;

  insert into public.order_internal_notification_outbox (
    order_id, channel, recipient_key, recipient_name, recipient_address, scheduled_at
  )
  select new.id, 'email', recipient.recipient_key, recipient.recipient_name,
    recipient.recipient_address, now()
  from private.order_email_notification_recipients() recipient
  on conflict (order_id, channel, recipient_key) do update
  set scheduled_at = now(), status = 'pending', last_error = null,
      locked_at = null, updated_at = now()
  where order_internal_notification_outbox.sent_at is null;

  insert into public.order_internal_notification_outbox (
    order_id, channel, recipient_key, recipient_name, recipient_address, scheduled_at
  )
  select new.id, 'whatsapp', recipient.id::text, recipient.name, recipient.phone, now()
  from public.order_first_notification_recipients recipient
  on conflict (order_id, channel, recipient_key) do update
  set scheduled_at = now(), status = 'pending', last_error = null,
      locked_at = null, updated_at = now()
  where order_internal_notification_outbox.sent_at is null;

  return new;
end;
$$;

-- Stop customer and internal notifications already queued for orders that were
-- cancelled before this guard was installed.
update public.wati_order_notification_outbox outbox
set status = 'skipped',
    wati_skipped_at = case when outbox.wati_sent_at is null
      then coalesce(outbox.wati_skipped_at, now()) else outbox.wati_skipped_at end,
    email_skipped_at = case when outbox.email_sent_at is null
      then coalesce(outbox.email_skipped_at, now()) else outbox.email_skipped_at end,
    wati_error = 'order_cancelled',
    email_error = 'order_cancelled',
    last_error = 'order_cancelled',
    locked_at = null,
    updated_at = now()
from public.orders orders
where orders.id = outbox.order_id
  and private.wati_order_is_cancelled(orders)
  and outbox.sent_at is null
  and outbox.status in ('pending', 'processing', 'failed');

update public.order_internal_notification_outbox outbox
set status = 'skipped',
    last_error = 'order_cancelled',
    locked_at = null,
    updated_at = now()
from public.orders orders
where orders.id = outbox.order_id
  and private.wati_order_is_cancelled(orders)
  and outbox.sent_at is null
  and outbox.status in ('pending', 'processing', 'failed');
