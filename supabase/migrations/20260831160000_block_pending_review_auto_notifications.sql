-- Customer notifications must never be sent automatically while an order is
-- still in the Shopify review queue. This applies to every automatic WATI and
-- email event, not only same-day delivery reminders.

create or replace function private.wati_order_is_pending_review(p_order public.orders)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_order.addon_shopify_pending, false)
    or (
      coalesce(p_order.is_shopify_order, false)
      and coalesce(p_order.source_system = 'shopify', false)
      and p_order.delivery_status is null
      and not coalesce(p_order.do_not_send_to_factory, false)
      and not coalesce(p_order.is_sent_to_factory, false)
    );
$$;

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
  select * into v_order
  from public.orders
  where id = p_order_id;

  if v_order.id is null
     or private.wati_order_is_pending_review(v_order)
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

create or replace function private.capture_wati_order_events()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_method text;
  v_rule record;
  v_occurrence text := txid_current()::text;
  v_was_pending_review boolean := false;
  v_is_pending_review boolean;
begin
  v_is_pending_review := private.wati_order_is_pending_review(new);

  if tg_op = 'INSERT' then
    if new.document_type = 'order'
       and new.archived_at is null
       and not v_is_pending_review
    then
      v_method := private.wati_delivery_method(new);
      perform private.enqueue_wati_order_event(
        new.id,
        case when v_method = 'pickup' then 'pickup_order_confirmed' else 'delivery_order_confirmed' end,
        'confirmed'
      );
    end if;
    return new;
  end if;

  v_was_pending_review := private.wati_order_is_pending_review(old);

  if new.document_type <> 'order' or new.archived_at is not null then
    if old.archived_at is null and new.archived_at is not null then
      perform private.enqueue_wati_order_event(new.id, 'order_cancelled', 'cancelled');
    end if;
    return new;
  end if;

  if v_is_pending_review then
    update public.wati_order_notification_outbox
    set status = 'skipped',
        wati_skipped_at = case when wati_sent_at is null
          then coalesce(wati_skipped_at, now()) else wati_skipped_at end,
        email_skipped_at = case when email_sent_at is null
          then coalesce(email_skipped_at, now()) else email_skipped_at end,
        wati_error = 'order_pending_review',
        email_error = 'order_pending_review',
        last_error = 'order_pending_review',
        locked_at = null,
        updated_at = now()
    where order_id = new.id
      and sent_at is null
      and status in ('pending', 'processing', 'failed');
    return new;
  end if;

  v_method := private.wati_delivery_method(new);

  if v_was_pending_review then
    perform private.enqueue_wati_order_event(
      new.id,
      case when v_method = 'pickup' then 'pickup_order_confirmed' else 'delivery_order_confirmed' end,
      'review-approved:' || v_occurrence
    );
    return new;
  end if;

  if old.document_type is distinct from new.document_type then
    perform private.enqueue_wati_order_event(
      new.id,
      case when v_method = 'pickup' then 'pickup_order_confirmed' else 'delivery_order_confirmed' end,
      'confirmed'
    );
  elsif old.delivery_at is distinct from new.delivery_at
     or old.delivery_time is distinct from new.delivery_time
     or old.shipping_address_snapshot is distinct from new.shipping_address_snapshot
     or old.shipping_method_id is distinct from new.shipping_method_id
  then
    perform private.enqueue_wati_order_event(new.id, 'order_details_updated', 'details:' || v_occurrence);
  end if;

  if old.delivery_status is distinct from new.delivery_status then
    for v_rule in
      select rule.event_key
      from public.wati_order_status_event_rules rule
      where rule.is_active
        and rule.source_field = 'delivery_status'
        and rule.status_value = coalesce(new.delivery_status, '')
    loop
      perform private.enqueue_wati_order_event(new.id, v_rule.event_key,
        case when v_rule.event_key = 'order_cancelled' then 'cancelled'
          else 'delivery-status:' || coalesce(new.delivery_status, '') || ':' || v_occurrence end
      );
    end loop;
  end if;

  if old.order_status_legacy_ids is distinct from new.order_status_legacy_ids then
    for v_rule in
      select rule.event_key, rule.status_value
      from public.wati_order_status_event_rules rule
      where rule.is_active
        and rule.source_field = 'order_status'
        and rule.status_value = any(coalesce(new.order_status_legacy_ids, '{}'::text[]))
        and not (rule.status_value = any(coalesce(old.order_status_legacy_ids, '{}'::text[])))
    loop
      perform private.enqueue_wati_order_event(
        new.id, v_rule.event_key, 'order-status:' || v_rule.status_value || ':' || v_occurrence
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists capture_wati_order_events on public.orders;
create trigger capture_wati_order_events
after insert or update of document_type, archived_at, delivery_at, delivery_time,
  shipping_address_snapshot, shipping_method_id, delivery_status,
  order_status_legacy_ids, is_sent_to_factory, do_not_send_to_factory,
  addon_shopify_pending, is_shopify_order, source_system
on public.orders
for each row execute function private.capture_wati_order_events();

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

-- Stop anything queued by an older function definition before this guard was
-- installed. A fresh confirmation is enqueued when the review is approved.
update public.wati_order_notification_outbox outbox
set status = 'skipped',
    wati_skipped_at = case when outbox.wati_sent_at is null
      then coalesce(outbox.wati_skipped_at, now()) else outbox.wati_skipped_at end,
    email_skipped_at = case when outbox.email_sent_at is null
      then coalesce(outbox.email_skipped_at, now()) else outbox.email_skipped_at end,
    wati_error = 'order_pending_review',
    email_error = 'order_pending_review',
    last_error = 'order_pending_review',
    locked_at = null,
    updated_at = now()
from public.orders orders
where orders.id = outbox.order_id
  and private.wati_order_is_pending_review(orders)
  and outbox.sent_at is null
  and outbox.status in ('pending', 'processing', 'failed');
