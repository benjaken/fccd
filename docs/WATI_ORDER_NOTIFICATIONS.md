# WATI order notifications

Customer order events are delivered through both WATI and email from the same
event data. Email copy lives in
`supabase/functions/_shared/order-notification-content.ts`; the approved WATI
templates must use the matching copy and parameter names listed in
`public.wati_order_notification_templates`.

There is deliberately no payment or outstanding-balance reminder.

## Events

| Event | Default WATI template name | Trigger |
| --- | --- | --- |
| Delivery order confirmed | `order_confirm_with_action_and_aolink` | A delivery order is created or a quote becomes an order |
| Pickup order confirmed | `pickup_order_confirmation` | A pickup order is created or a quote becomes an order |
| Delivery tomorrow | `delivery_tomorrow_reminder` | Hong Kong calendar day before delivery |
| Pickup tomorrow | `pickup_tomorrow_reminder` | Hong Kong calendar day before pickup |
| Delivery today | `delivery_today_reminder` | Delivery date in Hong Kong |
| Pickup today | `pickup_today_reminder` | Pickup date in Hong Kong |
| Details updated | `order_details_updated` | Date, time, address, or delivery method changes |
| Dispatched | `delivery_dispatched` | `delivery_status` becomes `送貨途中` |
| Ready for pickup | `pickup_ready` | Configurable operational order status |
| Completed | `order_completed` | `delivery_status` becomes `已送達`, plus configurable pickup status |
| Cancelled | `order_cancelled` | `delivery_status` becomes `已取消` or order is archived |

Pickup detection uses a delivery method whose `requires_address_check` is
false, or whose name contains `自取`/`pickup`.

## Existing Utility templates added to the event catalogue

These approved WATI templates are registered but remain inactive until their
parameter names and order are verified. They can be queued explicitly through
the service-role-only `enqueue_manual_wati_order_event` function; no automatic
database trigger is assumed.

| Event | Existing WATI template |
| --- | --- |
| Driver assigned | `driver_assign_reminder` |
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
6. Add production legacy status ids for pickup-ready and pickup-completed after
   confirming them in `order_statuses`:

   ```sql
   insert into public.wati_order_status_event_rules
     (source_field, status_value, event_key)
   values
     ('order_status', 'READY_PICKUP_LEGACY_ID', 'pickup_ready'),
     ('order_status', 'PICKUP_COMPLETE_LEGACY_ID', 'order_completed')
   on conflict do nothing;
   ```

7. Enable only templates that are approved and tested:

   ```sql
   update public.wati_order_notification_templates
   set is_active = true, updated_at = now()
   where event_key in (
     'delivery_order_confirmed',
     'pickup_order_confirmed',
     'delivery_tomorrow_reminder',
     'pickup_tomorrow_reminder',
     'delivery_today_reminder',
     'pickup_today_reminder',
     'order_details_updated',
     'delivery_dispatched',
     'pickup_ready',
     'order_completed',
     'order_cancelled'
   );
   ```

Templates are disabled by default so applying the migration cannot message real
customers. The minute scheduler safely deduplicates scheduled reminders and
retries each channel independently. A successful WATI send is never repeated
just because the matching email failed, and vice versa.

## Internal new-order notifications

The same minute scheduler also processes the settings under Order Settings:

- Users with `email_noti` enabled receive a Resend email after a new order is
  created.
- Every first notification recipient receives a WATI message after their
  configured delay in hours.

Both channels use a durable outbox, deduplicate by order and recipient, and
retry failed provider requests up to five times. Configure `ORDER_ADMIN_BASE_URL`
for the order link. The internal WATI template must be approved with these
parameters in this order: `recipient_name`, `order_number`, `customer_name`,
`created_at`, `order_link`. Set its approved name and broadcast name through
`WATI_INTERNAL_ORDER_TEMPLATE_NAME` and `WATI_INTERNAL_ORDER_BROADCAST_NAME`.
