-- Shopify imports must continue to create/update FCCD orders without sending
-- the former immediate internal WATI new-order alert. Historical sent rows are
-- retained for the audit log; only unfinished jobs are cancelled.

drop trigger if exists enqueue_shopify_imported_order_wati on public.orders;
drop function if exists private.enqueue_shopify_imported_order_wati();

update public.order_reconciliation_alert_outbox
set status = 'skipped',
    last_error = 'shopify_new_order_wati_disabled',
    locked_at = null,
    updated_at = now()
where event_key = 'shopify_order_imported'
  and channel = 'whatsapp'
  and sent_at is null
  and status in ('pending', 'processing', 'failed');
