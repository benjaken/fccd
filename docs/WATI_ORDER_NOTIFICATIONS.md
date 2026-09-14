# WATI order notifications

The worker is deployment-safe before launch: `WATI_NOTIFICATIONS_ACTIVATE_AT`
defaults to `2026-08-31T00:00:00+08:00`. Before that instant it returns without
enqueueing reminders, claiming queued jobs, or contacting WATI/Resend.

Customer order events share the same order data across WATI and email. Email
copy lives in
`supabase/functions/_shared/order-notification-content.ts`; the approved WATI
templates must use the matching copy and parameter names listed in
`public.wati_order_notification_templates`.

Customer-facing events use the same audience and business event on both
channels: the customer's snapshot email address for email and snapshot contact
number for WATI. Internal reminders never use customer contact details: email
goes to users with `email_noti` enabled, while WATI goes to
`order_first_notification_recipients`.

Every customer event in the catalogue has matching email content. WATI sending
still depends on the corresponding approved template being active; adding an
email template does not by itself approve or activate a WATI template.

Automatic customer notifications are also blocked while an order remains in
the Shopify review queue, including add-on changes awaiting review. The guard
applies to every automatic WATI and email event and is checked both when the
event is queued and immediately before provider delivery. Creating, converting,
approving, or sending an order to the factory does not enqueue an order
confirmation. Delivery and pickup confirmations are sent only through the
separately controlled manual action.

Email uses the same event copy and resolved order values as WATI, wrapped in a
responsive Food Channels Catering layout. The header uses
`/assets/fc-catering-logo-email.png`; the contact panel links to WhatsApp
`(+852) 5396 4335`, telephone `(+852) 2185 7373`,
`sales@foodchannels-catering.com`, and `foodchannels-catering.com`.
All Resend messages use `system@foodchannels-delivery.com` as the sender,
including order notifications, quote confirmations, and daily sales reports.

There is deliberately no payment or outstanding-balance reminder.

## Current notification matrix

| Notification | Audience | Trigger | WATI | Email |
| --- | --- | --- | --- | --- |
| Shopify new order | Internal | Shopify import/link | **Disabled** | Not used |
| Manual order confirmation | Customer | Order-page send action | Controlled separately | Controlled separately |
| Same-day delivery reminder | Customer | Automatic on delivery date | Automatic control | Automatic control |
| Same-day pickup reminder | Customer | Automatic on pickup date | Automatic control | Automatic control |
| Factory-unsent reminder | Internal | 12 hours before delivery window | Automatic control | Automatic control |
| Unassigned-driver reminder | Internal | 09:00–21:00 every three hours | Automatic control | Automatic control |
| Order reconciliation | Internal | Daily and urgent reconciliation runs | Automatic control | Automatic control |
| Manual Utility events | Customer/operational | Explicit service-role action | Inactive until verified | No shared email copy |

The WATI settings page has four independent controls: automatic WATI,
automatic email, manual order-confirmation WATI, and manual order-confirmation
email. Turning off one channel does not turn off its paired channel. Internal
email recipients are enabled FCCD users with notification email addresses;
internal WATI recipients are the configured first-notification recipients.

The WATI / Email send log is read-only and includes successful automatic sends.
It intentionally excludes skipped messages and manual confirmation sends.

## Events

| Event | Default WATI template name | Trigger |
| --- | --- | --- |
| Delivery order confirmed | `order_confirm_with_action_and_aolink` | Manual order-confirmation action only |
| Pickup order confirmed | `selfpick_order_confirmation_with_action2026` | Manual order-confirmation action only |
| Delivery tomorrow | `delivery_tomorrow_reminder` | Disabled; no preceding-day reminder |
| Pickup tomorrow | `pickup_tomorrow_reminder` | Disabled; no preceding-day reminder |
| Delivery today | `fccd_delivery_reminder` | Delivery date in Hong Kong |
| Pickup today | `fccd_selfpick_reminder1` | Pickup date in Hong Kong |
| Details updated | `order_details_updated` | Date, time, address, or delivery method changes |
| Dispatched | `delivery_dispatched` | `delivery_status` becomes `送貨途中` |
| Ready for pickup | `pickup_ready` | Configurable operational order status |
| Completed | `order_completed` | `delivery_status` becomes `已送達`, plus configurable pickup status |
| Cancelled | `order_cancelled` | `delivery_status` becomes `已取消` or order is archived |

`fccd_delivery_reminder` is automatic on the Hong Kong delivery date. If the
delivery window starts at or before 11:00, the reminder is due two hours before
its start. Orders whose window starts after 11:00 are notified at 09:00. The
scheduler does not enqueue a delivery-tomorrow reminder. WATI and email use the
same event and are sent together.

`fccd_selfpick_reminder1` is staged for 09:00 on the Hong Kong pickup date.
The pickup-tomorrow event is not enqueued. WATI and email use the same event and
are sent together.

Pickup detection uses a delivery method whose `requires_address_check` is
false, or whose name contains `自取`/`pickup`.

## Existing Utility templates added to the event catalogue

These approved WATI templates are registered but remain inactive until their
parameter names and order are verified. They can be queued explicitly through
the service-role-only `enqueue_manual_wati_order_event` function; no automatic
database trigger is assumed.

| Event | Existing WATI template |
| --- | --- |
| Driver assignment reminder | `fccd_driver_assign_reminder_v1` |
| Bad weather notice | `fc_bad_weather_reply_3` |
| Holiday service notice | `fc_holiday_notice` |
| Second contact requested | `second_contact_person` |
| Payment instructions sent | `fcr_new_payment` |
| Payment confirmed | `fcr_confirmation_paid` |
| Delivery delayed | `late_delivery_reply` |
| Order issue reported | `fck_cny_wrong_order` |

Do not activate these rows while `parameters` is an empty array unless the WATI
template has been confirmed to contain no variables.

## Activation checklist

1. Create and submit the WATI templates. Parameter names and their order are
   case-sensitive and must match the `parameters` JSON for each event.
2. If WATI assigned a different name, update `template_name` before activation.
   The approved production delivery-confirmation template is
   `order_confirm_with_action_and_aolink`; its broadcast name is
   `Confirmed Delivery message`.
3. Configure the Edge Function secrets shown in `.env.example`.
4. Create the Vault secret used by the database scheduler. Its value must equal
   `WATI_ORDER_CRON_SECRET`:

   ```sql
   select vault.create_secret('replace-with-a-random-secret', 'wati_order_cron_secret');
   ```

5. Configure the add-on link and deadline rule before enabling
   `delivery_order_confirmed`. `WATI_ADD_ON_DEADLINE_DAYS_BEFORE=2`, for example,
   renders a delivery on 28 August with a 26 August add-on deadline.
6. Enable only templates that are approved and tested:

   ```sql
   update public.wati_order_notification_templates
   set is_active = true, updated_at = now()
   where event_key in (
     'delivery_order_confirmed',
     'pickup_order_confirmed',
     'delivery_today_reminder',
     'pickup_today_reminder',
     'driver_assigned',
     'order_details_updated',
     'delivery_dispatched'
   );
   ```

Templates are disabled by default so applying the migration cannot message real
customers. The minute scheduler safely deduplicates scheduled reminders and
retries each channel independently. A successful WATI send is never repeated
just because the matching email failed, and vice versa.

## Daily unassigned-driver internal reminder

Starting at `DRIVER_ASSIGNMENT_REMINDER_HOUR_HK` (09:00 Hong Kong time by
default), the scheduler sends email and WATI internal reminders every three
hours at 09:00, 12:00, 15:00, 18:00 and 21:00 when tomorrow's delivery orders
still have no fleet assigned. Pickup, cancelled, archived, and fulfilled orders
are excluded. Each run rechecks the live assignment state. Each reminder shows
the current count; the email also includes a direct FCCD link for every affected
order, sorted by delivery time.

Email recipients are users with `email_noti` enabled. WATI recipients come from
`order_first_notification_recipients`. The approved internal WATI template is
`fccd_driver_assign_reminder_v1` and uses only `date` and `count`. Its fixed body is:

`明天 {{date}} 有 {{count}} 張訂單未派司機，請立即到以下連結中派車：https://www.foodchannels-delivery.com/delivery/assign`

The worker uses that template by default. It can still be overridden with
`WATI_DRIVER_ASSIGNMENT_REMINDER_TEMPLATE_NAME` and
`WATI_DRIVER_ASSIGNMENT_REMINDER_BROADCAST_NAME`. `ORDER_ADMIN_BASE_URL` is only
needed for the detailed links in the matching email reminder; the WATI template
uses its own fixed assignment URL.

The reminder uses a date, time-slot, channel, and recipient outbox, so each
recipient receives at most one reminder per three-hour slot. The live unassigned
list is read immediately before sending; if all orders have since been assigned,
the queued reminder is skipped. `driver_assigned` remains inactive until the
final rollout approval, which keeps both WATI and email stopped.

## Factory-unsent internal reminder

This replaces the former immediate internal new-order notification. For each
order that has not been sent to the factory, the worker waits until 12 hours
before the start of the delivery window and checks `is_sent_to_factory` again.
It skips orders marked `do_not_send_to_factory`.

- Users with `email_noti` enabled receive the internal email.
- `order_first_notification_recipients` receive the internal WATI reminder.

Both channels use a durable outbox, deduplicate by order and recipient, and
retry failed provider requests up to five times. Configure `ORDER_ADMIN_BASE_URL`
for the order link. The internal WATI template must be approved with these
parameters in this order: `recipient_name`, `order_number`, `customer_name`,
`delivery_date`, `delivery_time`, `order_link`. Set its approved name and
broadcast name through `WATI_FACTORY_UNSENT_TEMPLATE_NAME` and
`WATI_FACTORY_UNSENT_BROADCAST_NAME`.
