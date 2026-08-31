-- Rename the confirmed FCCD reminder templates and map the self-pick template
-- to the same-day pickup event. Do not change activation state.

update public.wati_order_notification_templates
set template_name = 'fccd_delivery_reminder',
    broadcast_name = 'FCCD delivery reminder',
    updated_at = now()
where template_name = 'fcc2_delivery_reminder';

update public.wati_order_notification_templates
set template_name = 'pickup_tomorrow_reminder',
    broadcast_name = 'pickup_tomorrow_reminder',
    updated_at = now()
where event_key = 'pickup_tomorrow_reminder';

update public.wati_order_notification_templates
set template_name = 'fccd_selfpick_reminder',
    broadcast_name = 'FCCD self-pick reminder',
    updated_at = now()
where event_key = 'pickup_today_reminder';
