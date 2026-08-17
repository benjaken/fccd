-- Rename the System Settings page so it is clearly a settings screen,
-- not one of the order queues.

update public.app_pages
set
  display_name = '訂單列表設定',
  updated_at = now()
where page_key = 'settings.order_lists'
  and display_name = '訂單列表';

update public.app_pages
set
  display_name = '編輯訂單列表設定',
  updated_at = now()
where page_key = 'settings.order_lists.edit'
  and display_name = '編輯訂單列表';
