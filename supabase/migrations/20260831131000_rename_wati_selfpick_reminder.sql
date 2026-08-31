-- Follow up the already-applied FCCD reminder rename with the latest
-- self-pick template name. Do not change activation state.

update public.wati_order_notification_templates
set template_name = 'fccd_selfpick_reminder1',
    broadcast_name = 'FCCD self-pick reminder',
    updated_at = now()
where event_key = 'pickup_today_reminder';
