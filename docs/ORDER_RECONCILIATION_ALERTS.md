# Internal Shopify/FCCD order reconciliation

This feature is internal-only. WhatsApp recipients are read from
`order_first_notification_recipients`; email recipients are users with
`email_noti` enabled. Customer phone and email snapshots are never used as
notification destinations.

## Reconciliation window

The daily comparison uses Hong Kong time and includes orders whose service
date is between one calendar month before today and every future date. Orders
without a service date remain in the anomaly set so they cannot fall outside
the comparison window.

At 08:45 Hong Kong time, `shopify-order-sync` runs in `reconcile` mode. It
fetches every open Shopify order plus all orders updated during the rolling
month. Webhooks continue to provide near-real-time create/update/delete data.
At or after 09:00, the notification worker creates one daily count and
order-level reconciliation run.

The worker also refreshes open issues every minute. An issue becomes urgent
when its calculated factory/service time is within six hours. A newly found
late order is notified immediately rather than waiting for the next daily run.
Only the main Supabase branch runs the scheduled reconciliation and sends
internal alerts. The develop branch has no reconciliation cron jobs, avoiding
duplicate notifications. The worker also supports `mode: reconciliation_only`
and the main-only minute schedule uses this isolated internal-only invocation.
It does not process customer-facing or unrelated notification queues.
Schedule creation additionally requires the main-only Vault opt-in
`order_reconciliation_notifications_enabled=true`; without it, the migration
removes any existing reconciliation schedules and does not recreate them.
This internal-only mode is independent of `WATI_NOTIFICATIONS_ACTIVATE_AT`;
the existing activation gate continues to protect every normal/customer run.

## Issue types

- `missing_fccd`: a Shopify-owned shadow has not been reconciled to an FCCD
  operational order.
- `unlinked_fccd`: an FCCD order marked as Shopify-originated has no Shopify
  order ID.
- `factory_unsent`: an operational order for today through the next two days,
  or within six hours, has not been sent to the factory.
- `missing_service_time`: an affected order has a service date but no usable
  ship-out/delivery time.

Service time uses `factory_date + ship_out_time` first and falls back to
`delivery_at + delivery_time`.

## In-app alert

Urgent issues create `order_reconciliation_urgent` business notifications for
users who can access Orders or Shopify Pending. The client shows a blocking
popup for unread urgent issues and a persistent red banner until the underlying
issue is resolved. Acknowledging the popup marks it read but does not resolve
the issue.

## WATI templates

Two approved internal templates must be configured before WhatsApp delivery:

- `WATI_ORDER_RECONCILIATION_DAILY_TEMPLATE_NAME`
- `WATI_ORDER_RECONCILIATION_DAILY_BROADCAST_NAME`
- `WATI_ORDER_RECONCILIATION_URGENT_TEMPLATE_NAME`
- `WATI_ORDER_RECONCILIATION_URGENT_BROADCAST_NAME`

Daily parameters, in order:

1. `recipient_name`
2. `date`
3. `scope_start`
4. `shopify_count`
5. `fccd_count`
6. `issue_count`
7. `issues`
8. `order_link`

Urgent parameters, in order:

1. `recipient_name`
2. `issue`
3. `order_link`

Missing WATI template configuration leaves WhatsApp jobs in the retry queue;
it never falls back to a customer-facing template or recipient.
