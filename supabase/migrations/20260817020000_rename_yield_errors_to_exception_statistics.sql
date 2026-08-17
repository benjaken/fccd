-- Rename Frozen Goods page copy from 收成錯誤統計 to 收成異常統計.

update public.app_pages
set
  display_name = '收成異常統計',
  updated_at = now()
where page_key = 'frozen.yield_errors';
