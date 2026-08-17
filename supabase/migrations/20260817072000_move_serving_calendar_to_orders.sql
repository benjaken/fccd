-- Move the serving calendar under Orders so the Orders sidebar stays open.

update public.app_pages
set
  display_name = '出餐日曆',
  route = '/orders/calendar',
  parent_page_key = 'orders',
  sort_order = 23,
  updated_at = now()
where page_key = 'kitchen.calendar';
