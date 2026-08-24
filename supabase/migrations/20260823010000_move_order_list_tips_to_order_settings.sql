-- Move order-list explanations from System Settings into Orders > Settings.
-- Keep the existing page keys so deployed role permissions continue to work.

update public.app_pages
set
  display_name = '訂單列表提示',
  route = '/orders/settings/order-list-tips',
  parent_page_key = 'orders.settings',
  sort_order = 36,
  updated_at = now()
where page_key = 'settings.order_lists';

update public.app_pages
set
  display_name = '編輯訂單列表提示',
  route = '/orders/settings/order-list-tips/actions/edit',
  updated_at = now()
where page_key = 'settings.order_lists.edit';
