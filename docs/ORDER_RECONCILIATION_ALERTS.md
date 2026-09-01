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
- `factory_unsent`: any active order for today through the next two days, or
  within six hours, has not been sent to the factory. This includes orders that
  are still in the Shopify review/editing queue; review state must not hide an
  unsent-factory warning.
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

WhatsApp sends one message per order. The daily email remains one aggregate
message with separate `未入單` and `未傳送工場` sections. If one order has both
issue types, the missing/import issue wins so the recipient does not receive two
daily WATI messages for the same order.

These internal templates must be approved and configured before WhatsApp delivery:

- `WATI_ORDER_RECONCILIATION_MISSING_TEMPLATE_NAME`
- `WATI_ORDER_RECONCILIATION_MISSING_BROADCAST_NAME`
- `WATI_ORDER_RECONCILIATION_FACTORY_UNSENT_TEMPLATE_NAME`
- `WATI_ORDER_RECONCILIATION_FACTORY_UNSENT_BROADCAST_NAME`
- `WATI_ORDER_RECONCILIATION_CLEAR_TEMPLATE_NAME`
- `WATI_ORDER_RECONCILIATION_CLEAR_BROADCAST_NAME`
- `WATI_ORDER_RECONCILIATION_URGENT_TEMPLATE_NAME`
- `WATI_ORDER_RECONCILIATION_URGENT_BROADCAST_NAME`
- `WATI_SHOPIFY_NEW_ORDER_TEMPLATE_NAME`
- `WATI_SHOPIFY_NEW_ORDER_BROADCAST_NAME`

The missing-order, factory-unsent, and Shopify-new-order templates share these
parameters, in order:

1. `brand_name`
2. `order_number`
3. `customer_name`
4. `delivery_date`
5. `delivery_time`
6. `delivery_address`
7. `order_link`

Suggested WATI approval samples:

| Parameter | Sample value |
| --- | --- |
| `brand_name` | `HK Lunch Box` |
| `order_number` | `6832` |
| `customer_name` | `Wong Lai Ling` |
| `delivery_date` | `16/05/2026` |
| `delivery_time` | `06:00 PM - 07:00 PM` |
| `delivery_address` | `大埔中心11座4樓E室` |
| `order_link` | `https://admin.example.com/orders/00000000-0000-0000-0000-000000000001` |

`brand_name` comes from the order channel and is normalized by
`resolveOrderNotificationShopName`. Missing brands display as `未設定品牌`; they
never silently fall back to Food Channels Catering.

Recommended Utility template body for a missing order:

```text
⚠️{{1}} 未入單警告⚠️（內部通知）

同事你好，{{1}} 訂單 #{{2}} 仍未處理，以下是訂單資料，請立即行動！

客人姓名：{{3}}
送貨日期：{{4}}
送貨時間：{{5}}
送貨地址：{{6}}

FCCD 訂單連結：{{7}}

請登入 FCCD 跟進處理，謝謝。
```

Recommended Utility template body for an order not sent to the factory. The
heading is deliberately fixed to `FCCD 未傳送工場警告` regardless of brand:

```text
⚠️FCCD 未傳送工場警告⚠️（內部通知）

同事你好，{{1}} 訂單 #{{2}} 尚未傳送工場，以下是訂單資料，請立即行動！

客人姓名：{{3}}
送貨日期：{{4}}
送貨時間：{{5}}
送貨地址：{{6}}

FCCD 訂單連結：{{7}}

請登入 FCCD 跟進處理，謝謝。
```

Recommended Utility template body for a newly imported Shopify order:

```text
⚠️FCCD Shopify 新訂單通知⚠️（內部通知）

同事你好，{{1}} 有一張新的 Shopify 訂單 #{{2}} 已導入 FCCD，請查看及處理。

客人姓名：{{3}}
送貨日期：{{4}}
送貨時間：{{5}}
送貨地址：{{6}}

FCCD 訂單連結：{{7}}

請登入 FCCD 跟進處理，謝謝。
```

The Shopify-import event is WhatsApp-only. It is queued only when a Shopify
order is first inserted or first linked to an FCCD order. Store ID plus Shopify
order ID forms the dedupe cycle, so webhook updates, reconciliation reruns, and
shadow-to-operational relinking do not send it again.

Daily clear parameters, in order:

1. `recipient_name`
2. `date`

The clear template is sent when both categories contain zero orders. Email uses
the same two categories and fields, with one visually separated block per order.

Recommended approved Utility template body for the all-clear message:

```text
早晨 {{1}} 👋

🎉 {{2}} 的訂單核對已完成！

今日沒有「未入單」或「未傳送工場」的訂單需要跟進，一切正常，祝工作順利！
```

Urgent parameters, in order:

1. `recipient_name`
2. `issue`
3. `order_link`

Missing WATI template configuration leaves WhatsApp jobs in the retry queue;
it never falls back to a customer-facing template or recipient.
