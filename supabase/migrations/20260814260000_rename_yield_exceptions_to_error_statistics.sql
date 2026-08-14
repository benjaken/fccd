-- Rename Frozen Goods page copy from 收成異常 to 收成錯誤統計.

update public.app_pages
set
  display_name = '收成錯誤統計',
  updated_at = now()
where page_key = 'frozen.yield_errors';
