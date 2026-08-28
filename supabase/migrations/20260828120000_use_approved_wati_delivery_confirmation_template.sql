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

-- Only routine order-flow notifications are automatic. Customer-service and
-- exception templates remain manual in WATI.
update public.wati_order_notification_templates
set
  template_name = case event_key
    when 'pickup_order_confirmed' then 'selfpick_order_confirmation_with_action2026'
    when 'delivery_tomorrow_reminder' then 'fcc2_delivery_reminder'
    when 'pickup_tomorrow_reminder' then 'fcc2_selfpick_reminder'
    else template_name
  end,
  broadcast_name = case event_key
    when 'pickup_order_confirmed' then 'Self-pick order confirmation 2026'
    when 'delivery_tomorrow_reminder' then 'FCC2 delivery reminder'
    when 'pickup_tomorrow_reminder' then 'FCC2 self-pick reminder'
    else broadcast_name
  end,
  is_active = event_key in (
    'delivery_order_confirmed',
    'pickup_order_confirmed',
    'delivery_tomorrow_reminder',
    'pickup_tomorrow_reminder'
  ),
  updated_at = now();
