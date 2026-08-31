-- Use the confirmed FCCD unassigned-driver reminder template.
-- The WATI template body owns the fixed assignment URL and accepts only
-- `date` and `count`. Preserve the existing activation state.

update public.wati_order_notification_templates
set template_name = 'fccd_driver_assign_reminder_v1',
    broadcast_name = 'fccd_driver_assign_reminder_v1',
    parameters = '[{"name":"date","source":"date"},{"name":"count","source":"count"}]'::jsonb,
    updated_at = now()
where event_key = 'driver_assigned';
