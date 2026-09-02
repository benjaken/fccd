-- Order confirmations are explicit customer communications. They must only be
-- sent through the manual order-confirmation action, never because an order was
-- created, converted, approved, or sent to the factory.

create or replace function private.capture_wati_order_events()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rule record;
  v_occurrence text := txid_current()::text;
  v_is_pending_review boolean;
begin
  -- There is intentionally no automatic insert-time order confirmation.
  if tg_op = 'INSERT' then
    return new;
  end if;

  v_is_pending_review := private.wati_order_is_pending_review(new);

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

  -- Leaving review, changing document type, and sending to the factory do not
  -- enqueue delivery_order_confirmed or pickup_order_confirmed. Those events
  -- are available only through the manual Edge Function.
  if old.document_type is not distinct from new.document_type
     and (
       old.delivery_at is distinct from new.delivery_at
       or old.delivery_time is distinct from new.delivery_time
       or old.shipping_address_snapshot is distinct from new.shipping_address_snapshot
       or old.shipping_method_id is distinct from new.shipping_method_id
     )
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
drop trigger if exists capture_wati_order_events_on_insert on public.orders;
drop trigger if exists capture_wati_order_events_on_update on public.orders;

create trigger capture_wati_order_events_on_update
after update of document_type, archived_at, delivery_at, delivery_time,
  shipping_address_snapshot, shipping_method_id, delivery_status,
  order_status_legacy_ids, is_sent_to_factory, do_not_send_to_factory,
  addon_shopify_pending, is_shopify_order, source_system
on public.orders
for each row execute function private.capture_wati_order_events();

-- Stop all automatic confirmations that were queued but have not completed.
-- Manual sends bypass this outbox and remain available.
update public.wati_order_notification_outbox as outbox
set status = 'skipped',
    wati_skipped_at = case when outbox.wati_sent_at is null
      then coalesce(outbox.wati_skipped_at, now()) else outbox.wati_skipped_at end,
    email_skipped_at = case when outbox.email_sent_at is null
      then coalesce(outbox.email_skipped_at, now()) else outbox.email_skipped_at end,
    wati_error = case when outbox.wati_sent_at is null
      then 'manual_confirmation_required' else outbox.wati_error end,
    email_error = case when outbox.email_sent_at is null
      then 'manual_confirmation_required' else outbox.email_error end,
    last_error = 'manual_confirmation_required',
    locked_at = null,
    updated_at = now()
where outbox.event_key in ('delivery_order_confirmed', 'pickup_order_confirmed')
  and outbox.sent_at is null
  and outbox.status in ('pending', 'processing', 'failed');
