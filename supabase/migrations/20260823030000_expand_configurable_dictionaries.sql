-- Extend the generic dictionary with the remaining configurable options used
-- by the current application. Stable values remain workflow identifiers;
-- labels, order, activation and metadata are maintained in System Settings.

insert into public.dict_types (code, name, description, sort_order)
values
  ('order_manual_todo', '訂單手動待辦', '訂單列表手動加入的待辦標籤。', 150),
  ('supplier_quote_price_unit', '供應商報價單位', '供應商 PDF 報價人工確認時可選的價格單位。', 160),
  ('catalog_status', '產品及套餐狀態', '產品及套餐共用的狀態顯示。', 170),
  ('product_price_range', '產品價格區間', '產品列表價格篩選區間；上下限儲存在 metadata。', 180)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

with seed(type_code, value, label, label_en, metadata, sort_order) as (
  values
    ('order_manual_todo', 'reschedule-pending', '改期待處理', 'Reschedule pending', '{"statusName":"改期未定"}'::jsonb, 10),
    ('order_manual_todo', 'lwp', 'LWP', 'LWP', '{"statusName":"WP"}'::jsonb, 20),
    ('order_manual_todo', 'lbw', 'LBW', 'LBW', '{"statusName":"BW"}'::jsonb, 30),
    ('order_manual_todo', 'lfp', 'LFP', 'LFP', '{"statusName":"FP"}'::jsonb, 40),
    ('order_manual_todo', 'klook', 'KLOOK', 'KLOOK', '{"statusName":"KLOOK"}'::jsonb, 50),
    ('order_manual_todo', 'alipay', 'Alipay', 'Alipay', '{"statusName":"Alipay"}'::jsonb, 60),
    ('order_manual_todo', 'cancelled', '已取消', 'Cancelled', '{"behavior":"cancelled"}'::jsonb, 70),
    ('order_manual_todo', 'monthly-settlement', '月結', 'Monthly settlement', '{"statusName":"月結"}'::jsonb, 80),
    ('supplier_quote_price_unit', 'kg', 'kg', 'kg', '{}'::jsonb, 10),
    ('supplier_quote_price_unit', 'box', 'box', 'box', '{}'::jsonb, 20),
    ('supplier_quote_price_unit', 'unit', 'unit', 'unit', '{}'::jsonb, 30),
    ('catalog_status', 'Active', '啟用', 'Active', '{"isActive":true}'::jsonb, 10),
    ('catalog_status', 'Inactive', '停用', 'Inactive', '{"isActive":false}'::jsonb, 20),
    ('product_price_range', 'under-100', '少於 $100', 'Under $100', '{"min":0,"max":100}'::jsonb, 10),
    ('product_price_range', '100-299', '$100 – $299', '$100 – $299', '{"min":100,"max":300}'::jsonb, 20),
    ('product_price_range', '300-799', '$300 – $799', '$300 – $799', '{"min":300,"max":800}'::jsonb, 30),
    ('product_price_range', '800-1999', '$800 – $1,999', '$800 – $1,999', '{"min":800,"max":2000}'::jsonb, 40),
    ('product_price_range', '2000-plus', '$2,000 或以上', '$2,000 or more', '{"min":2000,"max":null}'::jsonb, 50)
)
insert into public.dict_items (
  dict_type_id,
  value,
  label,
  label_en,
  metadata,
  sort_order
)
select
  types.id,
  seed.value,
  seed.label,
  seed.label_en,
  seed.metadata,
  seed.sort_order
from seed
join public.dict_types types on types.code = seed.type_code
on conflict (dict_type_id, value) do update
set
  label = excluded.label,
  label_en = excluded.label_en,
  metadata = excluded.metadata,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function private.validate_active_dict_item_column()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  type_code text := tg_argv[0];
  column_name text := tg_argv[1];
  next_value text := to_jsonb(new) ->> column_name;
  previous_value text;
begin
  if tg_op = 'UPDATE' then
    previous_value := to_jsonb(old) ->> column_name;
    if next_value is not distinct from previous_value then
      return new;
    end if;
  end if;

  if next_value is null or btrim(next_value) = '' then
    return new;
  end if;

  if not exists (
    select 1
    from public.dict_types types
    join public.dict_items items on items.dict_type_id = types.id
    where types.code = type_code
      and types.is_active
      and items.value = next_value
      and items.is_active
  ) then
    raise exception 'invalid dictionary value % for %', next_value, type_code
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_active_dict_item_column() from public;

alter table public.order_list_manual_todos
  drop constraint if exists order_list_manual_todos_todo_key_check;
drop trigger if exists validate_order_manual_todo_dict on public.order_list_manual_todos;
create trigger validate_order_manual_todo_dict
before insert or update of todo_key on public.order_list_manual_todos
for each row execute function private.validate_active_dict_item_column('order_manual_todo', 'todo_key');

alter table public.supplier_quote_lines
  drop constraint if exists supplier_quote_lines_price_unit_check;
drop trigger if exists validate_supplier_quote_price_unit_dict on public.supplier_quote_lines;
create trigger validate_supplier_quote_price_unit_dict
before insert or update of price_unit on public.supplier_quote_lines
for each row execute function private.validate_active_dict_item_column('supplier_quote_price_unit', 'price_unit');

drop trigger if exists validate_product_status_dict on public.products;
create trigger validate_product_status_dict
before insert or update of status on public.products
for each row execute function private.validate_active_dict_item_column('catalog_status', 'status');

drop trigger if exists validate_package_status_dict on public.packages;
create trigger validate_package_status_dict
before insert or update of status on public.packages
for each row execute function private.validate_active_dict_item_column('catalog_status', 'status');
