-- Orders marked 改期未定 (reschedule date pending) must not reach the factory
-- board and must not trigger any automatic same-day customer notification.
-- The status is stored as one of the order_status_legacy_ids, so the guard is
-- resolved from the configured order_statuses catalog rather than a hard-coded
-- legacy id. Removing the label lets the next reminder sweep resume normally.

create or replace function private.wati_reschedule_pending_status_ids()
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(status.legacy_id), '{}'::text[])
  from public.order_statuses status
  where status.archived_at is null
    and status.name in ('改期未定', '改期未審');
$$;

comment on function private.wati_reschedule_pending_status_ids() is
  'Legacy ids of the order statuses that mean the delivery date is pending reschedule.';

create or replace function private.wati_order_is_reschedule_pending(p_order public.orders)
returns boolean
language sql
stable
set search_path = public, private
as $$
  select coalesce(p_order.order_status_legacy_ids, '{}'::text[])
    && private.wati_reschedule_pending_status_ids();
$$;

comment on function private.wati_order_is_reschedule_pending(public.orders) is
  'True while an order carries the 改期未定/改期未審 reschedule-pending status.';

-- Same automatic customer-event allowlist plus the cancellation guard, and now
-- no reminder is queued for a reschedule-pending order either.
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
  if v_order.id is null
     or private.wati_order_is_cancelled(v_order)
     or private.wati_order_is_reschedule_pending(v_order)
  then
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
  'Queues only same-day delivery/pickup reminders, never for cancelled or reschedule-pending orders.';

-- Same-day delivery and self-pick reminder sweep. Exclude reschedule-pending
-- orders so an 改期未定 order with a same-day delivery_at is not queued until
-- the label is removed.
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
      and not private.wati_order_is_reschedule_pending(orders)
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

-- Stop anything queued before this guard was installed. When the label is
-- removed the reminder sweep queues same-day reminders again.
update public.wati_order_notification_outbox outbox
set status = 'skipped',
    wati_skipped_at = case when outbox.wati_sent_at is null
      then coalesce(outbox.wati_skipped_at, now()) else outbox.wati_skipped_at end,
    email_skipped_at = case when outbox.email_sent_at is null
      then coalesce(outbox.email_skipped_at, now()) else outbox.email_skipped_at end,
    wati_error = 'order_reschedule_pending',
    email_error = 'order_reschedule_pending',
    last_error = 'order_reschedule_pending',
    locked_at = null,
    updated_at = now()
from public.orders orders
where orders.id = outbox.order_id
  and private.wati_order_is_reschedule_pending(orders)
  and outbox.sent_at is null
  and outbox.status in ('pending', 'processing', 'failed');
