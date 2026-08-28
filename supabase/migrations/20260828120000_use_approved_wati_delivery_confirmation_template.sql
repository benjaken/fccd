-- Use the approved production WATI Utility template for delivery confirmations.
-- The ordered parameter mapping matches order_confirm_with_action_and_aolink.
update public.wati_order_notification_templates
set
  template_name = 'order_confirm_with_action_and_aolink',
  broadcast_name = 'Confirmed Delivery message',
  parameters = '[
    {"name":"name","source":"name"},
    {"name":"order_number","source":"order_number"},
    {"name":"date","source":"date"},
    {"name":"time","source":"time"},
    {"name":"address","source":"address"},
    {"name":"ao_deadline","source":"ao_deadline"},
    {"name":"ao_link","source":"ao_link"},
    {"name":"shop_name","source":"shop_name"}
  ]'::jsonb,
  updated_at = now()
where event_key = 'delivery_order_confirmed';
