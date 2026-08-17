-- Append 訂單 to the six queue labels in the Orders sidebar and settings.

update public.order_list_configs
set
  title = '未付款訂單',
  updated_at = now()
where preset_key = 'unpaid'
  and title = '未付款';

update public.order_list_configs
set
  title = '月結訂單',
  updated_at = now()
where preset_key = 'monthly-settlement'
  and title = '月結';

update public.order_list_configs
set
  title = '拆單訂單',
  updated_at = now()
where preset_key = 'split'
  and title = '拆單';

update public.order_list_configs
set
  title = '廚房備註訂單',
  updated_at = now()
where preset_key = 'kitchen-notes'
  and title = '廚房備註';

update public.order_list_configs
set
  title = '改期未審訂單',
  updated_at = now()
where preset_key = 'reschedule-pending'
  and title = '改期未審';

update public.order_list_configs
set
  title = 'Shopify待審訂單',
  updated_at = now()
where preset_key = 'shopify-pending'
  and title = 'Shopify待審';

update public.app_pages
set
  display_name = '月結訂單',
  updated_at = now()
where page_key = 'orders.monthly'
  and display_name = '月結';

update public.app_pages
set
  display_name = '拆單訂單',
  updated_at = now()
where page_key = 'orders.split'
  and display_name = '拆單';

update public.app_pages
set
  display_name = '廚房備註訂單',
  updated_at = now()
where page_key = 'orders.kitchen_notes'
  and display_name = '廚房備註';

update public.app_pages
set
  display_name = '改期未審訂單',
  updated_at = now()
where page_key = 'orders.reschedule_pending'
  and display_name = '改期未審';

update public.app_pages
set
  display_name = 'Shopify待審訂單',
  updated_at = now()
where page_key = 'orders.shopify_pending'
  and display_name = 'Shopify待審';
