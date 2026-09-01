-- A quote conversion creates an order immediately, but customer and internal
-- notifications must be sent manually from the resulting order. Keep the
-- existing automatic workflows for orders created by every other route and
-- for later order lifecycle events.

drop trigger if exists capture_wati_order_events on public.orders;
drop trigger if exists capture_wati_order_events_on_insert on public.orders;
drop trigger if exists capture_wati_order_events_on_update on public.orders;

create trigger capture_wati_order_events_on_insert
after insert on public.orders
for each row
when (new.source_quote_id is null)
execute function private.capture_wati_order_events();

create trigger capture_wati_order_events_on_update
after update of document_type, archived_at, delivery_at, delivery_time,
  shipping_address_snapshot, shipping_method_id, delivery_status,
  order_status_legacy_ids, is_sent_to_factory, do_not_send_to_factory,
  addon_shopify_pending, is_shopify_order, source_system
on public.orders
for each row execute function private.capture_wati_order_events();

drop trigger if exists enqueue_internal_order_notifications on public.orders;
drop trigger if exists enqueue_internal_order_notifications_on_insert on public.orders;
drop trigger if exists enqueue_internal_order_notifications_on_update on public.orders;

create trigger enqueue_internal_order_notifications_on_insert
after insert on public.orders
for each row
when (new.source_quote_id is null)
execute function private.enqueue_internal_order_notifications();

create trigger enqueue_internal_order_notifications_on_update
after update of
  document_type, archived_at, delivery_at, delivery_time,
  is_sent_to_factory, do_not_send_to_factory
on public.orders
for each row execute function private.enqueue_internal_order_notifications();

-- Cancel only unsent conversion-created confirmation jobs. The manual order
-- confirmation action calls its dedicated Edge Function and is unaffected.
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
from public.orders as orders
where orders.id = outbox.order_id
  and orders.source_quote_id is not null
  and outbox.event_key in ('delivery_order_confirmed', 'pickup_order_confirmed')
  and outbox.sent_at is null
  and outbox.status in ('pending', 'processing', 'failed');

update public.order_internal_notification_outbox as outbox
set status = 'skipped',
    last_error = 'manual_confirmation_required',
    locked_at = null,
    updated_at = now()
from public.orders as orders
where orders.id = outbox.order_id
  and orders.source_quote_id is not null
  and outbox.sent_at is null
  and outbox.status in ('pending', 'processing', 'failed');
