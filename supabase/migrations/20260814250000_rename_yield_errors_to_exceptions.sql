-- Rename Frozen Goods page copy from 收成錯誤 to 收成異常.

update public.app_pages
set
  display_name = '收成異常',
  updated_at = now()
where page_key = 'frozen.yield_errors';

comment on table public.meat_yield_errors is
  '收成異常: 生肉出貨實際入貨包數偏離預算收成超過 15% 的記錄。';
