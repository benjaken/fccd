-- Populate the new settings tables from the restaurant master data that was
-- already migrated from Bubble. Keep this idempotent so it is safe to replay.
-- Also repair Chinese literals that were corrupted when the original SQL was
-- sent without an explicit UTF-8 request body.
alter table public.restaurant_monthly_pnl_cost_categories
  drop constraint if exists restaurant_monthly_pnl_cost_categories_category_check;
alter table public.restaurant_monthly_pnl_cost_categories
  add constraint restaurant_monthly_pnl_cost_categories_category_check
  check (category in (
    'Discount', '其他營運開支', '員工成本', '外賣平台', '推廣費用',
    '收款平台手續費', '水電費', '租金', '行政費用'
  ));

update public.app_pages page
set display_name = names.display_name,
    updated_at = now()
from (values
  ('kitchen.ingredient_stocktakes', '食材盤點記錄'),
  ('kitchen.ingredient_stocktakes.delete', '刪除食材盤點記錄'),
  ('kitchen.ingredient_stocktakes.edit', '修改食材盤點數量'),
  ('kitchen.ingredients', '食材/包裝用品'),
  ('kitchen.ingredients.delete', '刪除食材/包裝用品'),
  ('kitchen.ingredients.edit', '新增/編輯食材/包裝用品'),
  ('kitchen.packing_stocktakes', '包裝盤點記錄'),
  ('kitchen.packing_stocktakes.delete', '刪除包裝盤點記錄'),
  ('kitchen.packing_stocktakes.edit', '修改包裝盤點數量'),
  ('restaurant.settings', '餐廳設定'),
  ('restaurant.settings.delivery_platforms', '餐廳外賣平台設定'),
  ('restaurant.settings.delivery_platforms.delete', '刪除餐廳外賣平台'),
  ('restaurant.settings.delivery_platforms.edit', '新增/編輯餐廳外賣平台'),
  ('restaurant.settings.departments', '餐廳部門設定'),
  ('restaurant.settings.departments.delete', '刪除餐廳部門'),
  ('restaurant.settings.departments.edit', '新增/編輯餐廳部門'),
  ('restaurant.settings.holidays', '餐廳員工假期'),
  ('restaurant.settings.holidays.delete', '刪除餐廳員工假期'),
  ('restaurant.settings.holidays.edit', '新增/編輯餐廳員工假期'),
  ('restaurant.settings.inventory_items', '庫存項目設定'),
  ('restaurant.settings.inventory_items.delete', '刪除庫存項目'),
  ('restaurant.settings.inventory_items.edit', '新增/編輯庫存項目'),
  ('restaurant.settings.monthly_pnl_cost_categories', '每月 P&L 費用類別'),
  ('restaurant.settings.monthly_pnl_cost_categories.delete', '刪除每月 P&L 費用類別'),
  ('restaurant.settings.monthly_pnl_cost_categories.edit', '新增/編輯每月 P&L 費用類別'),
  ('restaurant.settings.payment_methods', '餐廳付款方式設定'),
  ('restaurant.settings.payment_methods.delete', '刪除餐廳付款方式'),
  ('restaurant.settings.payment_methods.edit', '新增/編輯餐廳付款方式'),
  ('restaurant.settings.restaurants', '餐廳設定'),
  ('restaurant.settings.restaurants.delete', '刪除餐廳'),
  ('restaurant.settings.restaurants.edit', '新增/編輯餐廳'),
  ('restaurant.settings.roster_times', '餐廳更表時間'),
  ('restaurant.settings.roster_times.delete', '刪除餐廳更表時間'),
  ('restaurant.settings.roster_times.edit', '新增/編輯餐廳更表時間'),
  ('restaurant.settings.service_periods', '餐廳銷售時段設定'),
  ('restaurant.settings.service_periods.delete', '刪除餐廳銷售時段'),
  ('restaurant.settings.service_periods.edit', '新增/編輯餐廳銷售時段'),
  ('restaurant.settings.supplier_cost_categories', '供應商費用類別'),
  ('restaurant.settings.supplier_cost_categories.delete', '刪除供應商費用類別'),
  ('restaurant.settings.supplier_cost_categories.edit', '新增/編輯供應商費用類別'),
  ('restaurant.staff', '餐廳員工名單'),
  ('restaurant.staff.edit', '新增餐廳員工')
) as names(page_key, display_name)
where page.page_key = names.page_key;

insert into public.supplier_cost_categories (
  legacy_id,
  name,
  description,
  is_active,
  created_at,
  updated_at
)
select
  purchase_type.legacy_id,
  purchase_type.name,
  null,
  purchase_type.is_active,
  coalesce(purchase_type.bubble_created_at, purchase_type.created_at, now()),
  coalesce(purchase_type.bubble_modified_at, purchase_type.created_at, now())
from public.restaurant_purchase_types purchase_type
where purchase_type.archived_at is null
on conflict (legacy_id) do update
set
  name = excluded.name,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at,
  archived_at = null;

with source as (
  select
    cost.legacy_id,
    row_number() over (
      order by
        coalesce(cost_type.sort_order, 0),
        coalesce(cost.sort_order, 0),
        cost.name,
        cost.legacy_id
    )::integer as sort_order,
    cost_type.name as category,
    cost.name,
    cost.is_active,
    coalesce(cost.bubble_created_at, cost.created_at, now()) as created_at,
    coalesce(cost.bubble_modified_at, cost.created_at, now()) as updated_at
  from public.restaurant_costs cost
  join public.restaurant_cost_types cost_type
    on cost_type.id = cost.cost_type_id
   and cost_type.archived_at is null
  where cost.archived_at is null
)
insert into public.restaurant_monthly_pnl_cost_categories (
  legacy_id,
  sort_order,
  category,
  name,
  is_active,
  created_at,
  updated_at
)
select
  legacy_id,
  sort_order,
  category,
  name,
  is_active,
  created_at,
  updated_at
from source
on conflict (legacy_id) do update
set
  sort_order = excluded.sort_order,
  category = excluded.category,
  name = excluded.name,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at,
  archived_at = null;
