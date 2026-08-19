-- Packaging stocktake record list and inline quantity editing.
-- The UI has no separate edit action: authorised users edit a quantity directly
-- in the table cell and the row is saved on blur/Enter.

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values
  (
    'kitchen.packing_stocktakes',
    '包裝盤點記錄',
    '/kitchen/packing-stocktakes',
    54,
    false,
    'kitchen',
    'subpage'
  ),
  (
    'kitchen.packing_stocktakes.edit',
    '修改包裝盤點數量',
    '/kitchen/packing-stocktakes/actions/edit',
    55,
    true,
    'kitchen.packing_stocktakes',
    'action'
  )
on conflict (page_key) do update
set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

with roles(role) as (
  values
    ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'),
    ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
), pages as (
  select page_key, parent_page_key
  from public.app_pages
  where page_key in ('kitchen.packing_stocktakes', 'kitchen.packing_stocktakes.edit')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  pages.page_key,
  case
    when roles.role in ('Super Admin', 'Admin', 'Factory') then true
    when parent_permission.can_access is not null then parent_permission.can_access
    else false
  end,
  roles.role = 'Super Admin'
from roles
cross join pages
left join public.role_page_permissions parent_permission
  on parent_permission.role = roles.role
 and parent_permission.page_key = pages.parent_page_key
on conflict (role, page_key) do update
set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

drop policy if exists "Packing stocktake record readers" on public.packing_stocktake_events;
create policy "Packing stocktake record readers"
on public.packing_stocktake_events
for select to authenticated
using (private.has_page_access('kitchen.packing_stocktakes'));

drop policy if exists "Packing stocktake quantity editors" on public.packing_stocktake_events;
create policy "Packing stocktake quantity editors"
on public.packing_stocktake_events
for update to authenticated
using (private.has_page_access('kitchen.packing_stocktakes.edit'))
with check (private.has_page_access('kitchen.packing_stocktakes.edit'));

-- The record table joins the item master, so read access must cover the
-- selected item snapshots without granting broader ingredient write access.
drop policy if exists "Ingredient list readers read ingredients" on public.ingredients;
create policy "Ingredient list readers read ingredients"
on public.ingredients
for select to authenticated
using (
  private.has_page_access('kitchen.ingredients')
  or private.has_page_access('kitchen.packing_stocktakes')
);

create or replace function public.create_packing_stocktake(p_stocktake_date date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if p_stocktake_date is null then
    raise exception 'stocktake_date_required';
  end if;
  if not private.has_page_access('kitchen.packing_stocktakes.edit') then
    raise exception 'not_authorized';
  end if;

  insert into public.packing_stocktake_events (
    legacy_id,
    ingredient_id,
    ingredient_legacy_id,
    stocktake_at,
    quantity,
    sku_snapshot,
    bubble_created_at,
    created_at
  )
  select
    'web-packing-stocktake:' || p_stocktake_date::text || ':' || ingredient.id::text,
    ingredient.id,
    ingredient.legacy_id,
    (p_stocktake_date::timestamp at time zone 'Asia/Hong_Kong'),
    null,
    ingredient.sku,
    now(),
    now()
  from public.ingredients ingredient
  where ingredient.archived_at is null
    and ingredient.is_active
    and ingredient.is_packing_stocktake is true
    and not exists (
      select 1
      from public.packing_stocktake_events event
      where event.ingredient_id = ingredient.id
        and event.stocktake_at >= (p_stocktake_date::timestamp at time zone 'Asia/Hong_Kong')
        and event.stocktake_at < ((p_stocktake_date + 1)::timestamp at time zone 'Asia/Hong_Kong')
    )
  on conflict (legacy_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_packing_stocktake(date) from public, anon;
grant execute on function public.create_packing_stocktake(date) to authenticated;

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('kitchen.ingredient_stocktakes', '食材盤點記錄', '/kitchen/ingredient-stocktakes', 56, false, 'kitchen', 'subpage'),
  ('kitchen.ingredient_stocktakes.edit', '修改食材盤點數量', '/kitchen/ingredient-stocktakes/actions/edit', 57, true, 'kitchen.ingredient_stocktakes', 'action')
on conflict (page_key) do update
set display_name = excluded.display_name, route = excluded.route, sort_order = excluded.sort_order,
    is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key,
    page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (
  values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
), pages as (
  select page_key, parent_page_key from public.app_pages
  where page_key in ('kitchen.ingredient_stocktakes', 'kitchen.ingredient_stocktakes.edit')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key,
  case when roles.role in ('Super Admin', 'Admin', 'Factory') then true when parent_permission.can_access is not null then parent_permission.can_access else false end,
  roles.role = 'Super Admin'
from roles cross join pages
left join public.role_page_permissions parent_permission on parent_permission.role = roles.role and parent_permission.page_key = pages.parent_page_key
on conflict (role, page_key) do update
set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

drop policy if exists "Ingredient stocktake record readers" on public.ingredient_stocktake_events;
create policy "Ingredient stocktake record readers" on public.ingredient_stocktake_events
for select to authenticated using (private.has_page_access('kitchen.ingredient_stocktakes'));

drop policy if exists "Ingredient stocktake quantity editors" on public.ingredient_stocktake_events;
create policy "Ingredient stocktake quantity editors" on public.ingredient_stocktake_events
for update to authenticated
using (private.has_page_access('kitchen.ingredient_stocktakes.edit'))
with check (private.has_page_access('kitchen.ingredient_stocktakes.edit'));

drop policy if exists "Ingredient list readers read ingredients" on public.ingredients;
create policy "Ingredient list readers read ingredients" on public.ingredients
for select to authenticated using (
  private.has_page_access('kitchen.ingredients')
  or private.has_page_access('kitchen.packing_stocktakes')
  or private.has_page_access('kitchen.ingredient_stocktakes')
);

create or replace function public.create_ingredient_stocktake(p_stocktake_date date)
returns integer language plpgsql security invoker set search_path = '' as $$
declare inserted_count integer;
begin
  if p_stocktake_date is null then raise exception 'stocktake_date_required'; end if;
  if not private.has_page_access('kitchen.ingredient_stocktakes.edit') then raise exception 'not_authorized'; end if;
  insert into public.ingredient_stocktake_events (legacy_id, ingredient_id, ingredient_legacy_id, stocktake_at, quantity, sku_snapshot, bubble_created_at, created_at)
  select 'web-ingredient-stocktake:' || p_stocktake_date::text || ':' || ingredient.id::text,
    ingredient.id, ingredient.legacy_id, (p_stocktake_date::timestamp at time zone 'Asia/Hong_Kong'), null,
    ingredient.sku, now(), now()
  from public.ingredients ingredient
  where ingredient.archived_at is null and ingredient.is_active and ingredient.is_ingredient_stocktake is true
    and not exists (
      select 1 from public.ingredient_stocktake_events event
      where event.ingredient_id = ingredient.id
        and event.stocktake_at >= (p_stocktake_date::timestamp at time zone 'Asia/Hong_Kong')
        and event.stocktake_at < ((p_stocktake_date + 1)::timestamp at time zone 'Asia/Hong_Kong')
    )
  on conflict (legacy_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.create_ingredient_stocktake(date) from public, anon;
grant execute on function public.create_ingredient_stocktake(date) to authenticated;

alter table public.packing_stocktake_events
  add column if not exists updated_at timestamptz not null default now();
alter table public.ingredient_stocktake_events
  add column if not exists updated_at timestamptz not null default now();

update public.packing_stocktake_events
set updated_at = coalesce(bubble_created_at, created_at)
where updated_at is null or updated_at = created_at;
update public.ingredient_stocktake_events
set updated_at = coalesce(bubble_created_at, created_at)
where updated_at is null or updated_at = created_at;

drop policy if exists "Packing stocktake record deleters" on public.packing_stocktake_events;
create policy "Packing stocktake record deleters" on public.packing_stocktake_events
for delete to authenticated using (private.has_page_access('kitchen.packing_stocktakes.delete'));
drop policy if exists "Ingredient stocktake record deleters" on public.ingredient_stocktake_events;
create policy "Ingredient stocktake record deleters" on public.ingredient_stocktake_events
for delete to authenticated using (private.has_page_access('kitchen.ingredient_stocktakes.delete'));

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('kitchen.packing_stocktakes.delete', '刪除包裝盤點記錄', '/kitchen/packing-stocktakes/actions/delete', 58, true, 'kitchen.packing_stocktakes', 'action'),
  ('kitchen.ingredient_stocktakes.delete', '刪除食材盤點記錄', '/kitchen/ingredient-stocktakes/actions/delete', 59, true, 'kitchen.ingredient_stocktakes', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route,
  sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (
  values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
), pages as (
  select page_key, parent_page_key from public.app_pages
  where page_key in ('kitchen.packing_stocktakes.delete', 'kitchen.ingredient_stocktakes.delete')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key,
  case when roles.role in ('Super Admin', 'Admin', 'Factory') then true when parent_permission.can_access is not null then parent_permission.can_access else false end,
  roles.role = 'Super Admin'
from roles cross join pages
left join public.role_page_permissions parent_permission on parent_permission.role = roles.role and parent_permission.page_key = pages.parent_page_key
on conflict (role, page_key) do update
set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

create or replace function public.delete_packing_stocktake(p_stocktake_date date)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.has_page_access('kitchen.packing_stocktakes.delete') then raise exception 'not_authorized'; end if;
  delete from public.packing_stocktake_events
  where stocktake_at >= (p_stocktake_date::timestamp at time zone 'Asia/Hong_Kong')
    and stocktake_at < ((p_stocktake_date + 1)::timestamp at time zone 'Asia/Hong_Kong');
end;
$$;
create or replace function public.delete_ingredient_stocktake(p_stocktake_date date)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.has_page_access('kitchen.ingredient_stocktakes.delete') then raise exception 'not_authorized'; end if;
  delete from public.ingredient_stocktake_events
  where stocktake_at >= (p_stocktake_date::timestamp at time zone 'Asia/Hong_Kong')
    and stocktake_at < ((p_stocktake_date + 1)::timestamp at time zone 'Asia/Hong_Kong');
end;
$$;
revoke all on function public.delete_packing_stocktake(date), public.delete_ingredient_stocktake(date) from public, anon;
grant execute on function public.delete_packing_stocktake(date), public.delete_ingredient_stocktake(date) to authenticated;

alter table public.restaurant_staff
  add column if not exists phone text,
  add column if not exists department text check (department is null or department in ('樓面', '廚房', '水吧')),
  add column if not exists employment_type text check (employment_type is null or employment_type in ('全職', '兼職'));

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('restaurant.staff', '餐廳員工名單', '/restaurant/staff', 60, false, 'restaurant', 'subpage'),
  ('restaurant.staff.edit', '新增餐廳員工', '/restaurant/staff/actions/edit', 61, true, 'restaurant.staff', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route,
  sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')),
pages as (select page_key, parent_page_key from public.app_pages where page_key in ('restaurant.staff', 'restaurant.staff.edit'))
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key,
  case when roles.role in ('Super Admin', 'Admin', 'Shop manager') then true when parent_permission.can_access is not null then parent_permission.can_access else false end,
  roles.role = 'Super Admin'
from roles cross join pages left join public.role_page_permissions parent_permission on parent_permission.role = roles.role and parent_permission.page_key = pages.parent_page_key
on conflict (role, page_key) do update set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

-- Replace the legacy role-hardcoded policies from
-- 20260812070844_create_restaurant_operations.  PostgreSQL permissive
-- policies are OR-ed together, so leaving those policies in place would let
-- their broad Admin/Accounting/Shop manager grants bypass the page actions
-- introduced below.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'restaurant_staff',
    'restaurants',
    'restaurant_ingredients',
    'restaurant_ingredient_departments',
    'restaurant_departments',
    'restaurant_service_periods',
    'restaurant_payment_methods',
    'restaurant_delivery_platforms',
    'restaurant_holidays',
    'restaurant_time_slots'
  ] loop
    foreach policy_name in array array[
      'Restaurant reads ' || table_name,
      'Administrators insert ' || table_name,
      'Administrators update ' || table_name,
      'Administrators delete ' || table_name
    ] loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end;
$$;

create policy "Restaurant staff page readers" on public.restaurant_staff for select to authenticated using (private.has_page_access('restaurant.staff'));
create policy "Restaurant staff editors" on public.restaurant_staff for insert to authenticated with check (private.has_page_access('restaurant.staff.edit'));
create policy "Restaurant staff page restaurant readers" on public.restaurants for select to authenticated using (private.has_page_access('restaurant.staff'));

create table if not exists public.supplier_cost_categories (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
alter table public.supplier_cost_categories enable row level security;

create table if not exists public.restaurant_monthly_pnl_cost_categories (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  sort_order integer not null default 0,
  category text not null check (category in ('Discount', '其他營運開支', '員工成本', '外賣平台', '推廣費用', '收款平台手續費', '水電費', '租金', '行政費用')),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
alter table public.restaurant_monthly_pnl_cost_categories enable row level security;

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('restaurant.settings.monthly_pnl_cost_categories', '每月 P&L 費用類別', '/restaurant/settings/monthly-pnl-cost-categories', 65, false, 'restaurant', 'subpage'),
  ('restaurant.settings.monthly_pnl_cost_categories.edit', '新增/編輯每月 P&L 費用類別', '/restaurant/settings/monthly-pnl-cost-categories/actions/edit', 66, true, 'restaurant.settings.monthly_pnl_cost_categories', 'action'),
  ('restaurant.settings.monthly_pnl_cost_categories.delete', '刪除每月 P&L 費用類別', '/restaurant/settings/monthly-pnl-cost-categories/actions/delete', 67, true, 'restaurant.settings.monthly_pnl_cost_categories', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route, sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')),
pages as (select page_key from public.app_pages where page_key like 'restaurant.settings.monthly_pnl_cost_categories%')
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, case when roles.role in ('Super Admin', 'Admin', 'Shop manager') then true else false end, roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

create policy "Monthly P&L cost category readers" on public.restaurant_monthly_pnl_cost_categories for select to authenticated using (private.has_page_access('restaurant.settings.monthly_pnl_cost_categories'));
create policy "Monthly P&L cost category inserts" on public.restaurant_monthly_pnl_cost_categories for insert to authenticated with check (private.has_page_access('restaurant.settings.monthly_pnl_cost_categories.edit'));
create policy "Monthly P&L cost category updates" on public.restaurant_monthly_pnl_cost_categories for update to authenticated using (private.has_page_access('restaurant.settings.monthly_pnl_cost_categories.edit')) with check (private.has_page_access('restaurant.settings.monthly_pnl_cost_categories.edit'));
create policy "Monthly P&L cost category deletes" on public.restaurant_monthly_pnl_cost_categories for delete to authenticated using (private.has_page_access('restaurant.settings.monthly_pnl_cost_categories.delete'));

alter table public.restaurant_ingredients add column if not exists updated_at timestamptz not null default now();

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('restaurant.settings', '餐廳設定', '/restaurant/settings/restaurants', 68, false, 'restaurant', 'subpage'),
  ('restaurant.settings.inventory_items', '庫存項目設定', '/restaurant/settings/inventory-items', 69, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.inventory_items.edit', '新增/編輯庫存項目', '/restaurant/settings/inventory-items/actions/edit', 70, true, 'restaurant.settings.inventory_items', 'action'),
  ('restaurant.settings.inventory_items.delete', '刪除庫存項目', '/restaurant/settings/inventory-items/actions/delete', 71, true, 'restaurant.settings.inventory_items', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route, sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')),
pages as (select page_key from public.app_pages where page_key in ('restaurant.settings', 'restaurant.settings.inventory_items', 'restaurant.settings.inventory_items.edit', 'restaurant.settings.inventory_items.delete'))
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, case when roles.role in ('Super Admin', 'Admin', 'Shop manager') then true else false end, roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

create policy "Restaurant inventory settings readers" on public.restaurant_ingredients for select to authenticated using (private.has_page_access('restaurant.settings.inventory_items'));
create policy "Restaurant inventory settings editors" on public.restaurant_ingredients for all to authenticated using (private.has_page_access('restaurant.settings.inventory_items.edit') or private.has_page_access('restaurant.settings.inventory_items.delete')) with check (private.has_page_access('restaurant.settings.inventory_items.edit'));
create policy "Restaurant inventory settings department readers" on public.restaurant_ingredient_departments for select to authenticated using (private.has_page_access('restaurant.settings.inventory_items'));
create policy "Restaurant inventory settings department editors" on public.restaurant_ingredient_departments for all to authenticated using (private.has_page_access('restaurant.settings.inventory_items.edit')) with check (private.has_page_access('restaurant.settings.inventory_items.edit'));
create policy "Restaurant inventory settings supplier readers" on public.suppliers for select to authenticated using (private.has_page_access('restaurant.settings.inventory_items'));

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('restaurant.settings.restaurants', '餐廳設定', '/restaurant/settings/restaurants', 72, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.restaurants.edit', '新增/編輯餐廳', '/restaurant/settings/restaurants/actions/edit', 73, true, 'restaurant.settings.restaurants', 'action'),
  ('restaurant.settings.restaurants.delete', '刪除餐廳', '/restaurant/settings/restaurants/actions/delete', 74, true, 'restaurant.settings.restaurants', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route, sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')),
pages as (select page_key from public.app_pages where page_key in ('restaurant.settings.restaurants', 'restaurant.settings.restaurants.edit', 'restaurant.settings.restaurants.delete'))
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, case when roles.role in ('Super Admin', 'Admin', 'Shop manager') then true else false end, roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

create policy "Restaurant settings page readers" on public.restaurants for select to authenticated using (private.has_page_access('restaurant.settings.restaurants'));
create policy "Restaurant settings page editors" on public.restaurants for all to authenticated using (private.has_page_access('restaurant.settings.restaurants.edit') or private.has_page_access('restaurant.settings.restaurants.delete')) with check (private.has_page_access('restaurant.settings.restaurants.edit'));

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('restaurant.settings.departments', '餐廳部門設定', '/restaurant/settings/departments', 75, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.departments.edit', '新增/編輯餐廳部門', '/restaurant/settings/departments/actions/edit', 76, true, 'restaurant.settings.departments', 'action'),
  ('restaurant.settings.departments.delete', '刪除餐廳部門', '/restaurant/settings/departments/actions/delete', 77, true, 'restaurant.settings.departments', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route, sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')),
pages as (select page_key from public.app_pages where page_key in ('restaurant.settings.departments', 'restaurant.settings.departments.edit', 'restaurant.settings.departments.delete'))
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, case when roles.role in ('Super Admin', 'Admin', 'Shop manager') then true else false end, roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

create policy "Restaurant department settings readers" on public.restaurant_departments for select to authenticated using (private.has_page_access('restaurant.settings.departments'));
create policy "Restaurant department settings editors" on public.restaurant_departments for all to authenticated using (private.has_page_access('restaurant.settings.departments.edit') or private.has_page_access('restaurant.settings.departments.delete')) with check (private.has_page_access('restaurant.settings.departments.edit'));

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('restaurant.settings.supplier_cost_categories', '供應商費用類別', '/restaurant/settings/supplier-cost-categories', 78, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.supplier_cost_categories.edit', '新增/編輯供應商費用類別', '/restaurant/settings/supplier-cost-categories/actions/edit', 79, true, 'restaurant.settings.supplier_cost_categories', 'action'),
  ('restaurant.settings.supplier_cost_categories.delete', '刪除供應商費用類別', '/restaurant/settings/supplier-cost-categories/actions/delete', 80, true, 'restaurant.settings.supplier_cost_categories', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route, sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')),
pages as (select page_key from public.app_pages where page_key in ('restaurant.settings.supplier_cost_categories', 'restaurant.settings.supplier_cost_categories.edit', 'restaurant.settings.supplier_cost_categories.delete'))
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, case when roles.role in ('Super Admin', 'Admin', 'Shop manager') then true else false end, roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

create policy "Restaurant supplier cost category readers" on public.supplier_cost_categories for select to authenticated using (private.has_page_access('restaurant.settings.supplier_cost_categories'));
create policy "Restaurant supplier cost category inserts" on public.supplier_cost_categories for insert to authenticated with check (private.has_page_access('restaurant.settings.supplier_cost_categories.edit'));
create policy "Restaurant supplier cost category updates" on public.supplier_cost_categories for update to authenticated using (private.has_page_access('restaurant.settings.supplier_cost_categories.edit')) with check (private.has_page_access('restaurant.settings.supplier_cost_categories.edit'));
create policy "Restaurant supplier cost category deletes" on public.supplier_cost_categories for delete to authenticated using (private.has_page_access('restaurant.settings.supplier_cost_categories.delete'));

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('restaurant.settings.service_periods', '餐廳銷售時段設定', '/restaurant/settings/service-periods', 81, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.service_periods.edit', '新增/編輯餐廳銷售時段', '/restaurant/settings/service-periods/actions/edit', 82, true, 'restaurant.settings.service_periods', 'action'),
  ('restaurant.settings.service_periods.delete', '刪除餐廳銷售時段', '/restaurant/settings/service-periods/actions/delete', 83, true, 'restaurant.settings.service_periods', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route, sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')),
pages as (select page_key from public.app_pages where page_key in ('restaurant.settings.service_periods', 'restaurant.settings.service_periods.edit', 'restaurant.settings.service_periods.delete'))
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, case when roles.role in ('Super Admin', 'Admin', 'Shop manager') then true else false end, roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

create policy "Restaurant service period settings readers" on public.restaurant_service_periods for select to authenticated using (private.has_page_access('restaurant.settings.service_periods'));
create policy "Restaurant service period settings editors" on public.restaurant_service_periods for all to authenticated using (private.has_page_access('restaurant.settings.service_periods.edit') or private.has_page_access('restaurant.settings.service_periods.delete')) with check (private.has_page_access('restaurant.settings.service_periods.edit'));

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('restaurant.settings.payment_methods', '餐廳付款方式設定', '/restaurant/settings/payment-methods', 84, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.payment_methods.edit', '新增/編輯餐廳付款方式', '/restaurant/settings/payment-methods/actions/edit', 85, true, 'restaurant.settings.payment_methods', 'action'),
  ('restaurant.settings.payment_methods.delete', '刪除餐廳付款方式', '/restaurant/settings/payment-methods/actions/delete', 86, true, 'restaurant.settings.payment_methods', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route, sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')),
pages as (select page_key from public.app_pages where page_key in ('restaurant.settings.payment_methods', 'restaurant.settings.payment_methods.edit', 'restaurant.settings.payment_methods.delete'))
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, case when roles.role in ('Super Admin', 'Admin', 'Shop manager') then true else false end, roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

create policy "Restaurant payment method settings readers" on public.restaurant_payment_methods for select to authenticated using (private.has_page_access('restaurant.settings.payment_methods'));
create policy "Restaurant payment method settings editors" on public.restaurant_payment_methods for all to authenticated using (private.has_page_access('restaurant.settings.payment_methods.edit') or private.has_page_access('restaurant.settings.payment_methods.delete')) with check (private.has_page_access('restaurant.settings.payment_methods.edit'));

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('restaurant.settings.delivery_platforms', '餐廳外賣平台設定', '/restaurant/settings/delivery-platforms', 87, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.delivery_platforms.edit', '新增/編輯餐廳外賣平台', '/restaurant/settings/delivery-platforms/actions/edit', 88, true, 'restaurant.settings.delivery_platforms', 'action'),
  ('restaurant.settings.delivery_platforms.delete', '刪除餐廳外賣平台', '/restaurant/settings/delivery-platforms/actions/delete', 89, true, 'restaurant.settings.delivery_platforms', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route, sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')),
pages as (select page_key from public.app_pages where page_key in ('restaurant.settings.delivery_platforms', 'restaurant.settings.delivery_platforms.edit', 'restaurant.settings.delivery_platforms.delete'))
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, case when roles.role in ('Super Admin', 'Admin', 'Shop manager') then true else false end, roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

create policy "Restaurant delivery platform settings readers" on public.restaurant_delivery_platforms for select to authenticated using (private.has_page_access('restaurant.settings.delivery_platforms'));
create policy "Restaurant delivery platform settings editors" on public.restaurant_delivery_platforms for all to authenticated using (private.has_page_access('restaurant.settings.delivery_platforms.edit') or private.has_page_access('restaurant.settings.delivery_platforms.delete')) with check (private.has_page_access('restaurant.settings.delivery_platforms.edit'));

alter table public.restaurant_holidays
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('restaurant.settings.holidays', '餐廳員工假期', '/restaurant/settings/holidays', 90, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.holidays.edit', '新增/編輯餐廳員工假期', '/restaurant/settings/holidays/actions/edit', 91, true, 'restaurant.settings.holidays', 'action'),
  ('restaurant.settings.holidays.delete', '刪除餐廳員工假期', '/restaurant/settings/holidays/actions/delete', 92, true, 'restaurant.settings.holidays', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route, sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')),
pages as (select page_key from public.app_pages where page_key in ('restaurant.settings.holidays', 'restaurant.settings.holidays.edit', 'restaurant.settings.holidays.delete'))
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, case when roles.role in ('Super Admin', 'Admin', 'Shop manager') then true else false end, roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

create policy "Restaurant holiday settings readers" on public.restaurant_holidays for select to authenticated using (private.has_page_access('restaurant.settings.holidays'));
create policy "Restaurant holiday settings editors" on public.restaurant_holidays for all to authenticated using (private.has_page_access('restaurant.settings.holidays.edit') or private.has_page_access('restaurant.settings.holidays.delete')) with check (private.has_page_access('restaurant.settings.holidays.edit'));

alter table public.restaurant_time_slots
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

insert into public.app_pages (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values
  ('restaurant.settings.roster_times', '餐廳更表時間', '/restaurant/settings/roster-times', 93, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.roster_times.edit', '新增/編輯餐廳更表時間', '/restaurant/settings/roster-times/actions/edit', 94, true, 'restaurant.settings.roster_times', 'action'),
  ('restaurant.settings.roster_times.delete', '刪除餐廳更表時間', '/restaurant/settings/roster-times/actions/delete', 95, true, 'restaurant.settings.roster_times', 'action')
on conflict (page_key) do update set display_name = excluded.display_name, route = excluded.route, sort_order = excluded.sort_order, is_high_risk = excluded.is_high_risk, parent_page_key = excluded.parent_page_key, page_kind = excluded.page_kind, updated_at = now();

with roles(role) as (values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')),
pages as (select page_key from public.app_pages where page_key in ('restaurant.settings.roster_times', 'restaurant.settings.roster_times.edit', 'restaurant.settings.roster_times.delete'))
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, case when roles.role in ('Super Admin', 'Admin', 'Shop manager') then true else false end, roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update set can_access = excluded.can_access, can_manage = excluded.can_manage, updated_at = now();

create policy "Restaurant roster time settings readers" on public.restaurant_time_slots for select to authenticated using (private.has_page_access('restaurant.settings.roster_times'));
create policy "Restaurant roster time settings editors" on public.restaurant_time_slots for all to authenticated using (private.has_page_access('restaurant.settings.roster_times.edit') or private.has_page_access('restaurant.settings.roster_times.delete')) with check (private.has_page_access('restaurant.settings.roster_times.edit'));
create policy "Restaurant roster time service period readers" on public.restaurant_service_periods for select to authenticated using (private.has_page_access('restaurant.settings.roster_times'));
