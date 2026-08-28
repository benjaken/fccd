-- `fcc2_delivery_reminder` is the same-day delivery reminder. It was
-- previously attached to the next-day event, which caused tomorrow's orders
-- to receive wording intended for deliveries happening today.
--
-- Keep both events disabled. Notification scheduling must be explicitly
-- re-enabled only after the production send controls are reviewed.

update public.wati_order_notification_templates
set template_name = 'fcc2_delivery_reminder',
    broadcast_name = 'FCC2 delivery reminder',
    is_active = false,
    updated_at = now()
where event_key = 'delivery_today_reminder';

update public.wati_order_notification_templates
set template_name = 'delivery_tomorrow_reminder',
    broadcast_name = 'delivery_tomorrow_reminder',
    is_active = false,
    updated_at = now()
where event_key = 'delivery_tomorrow_reminder';
