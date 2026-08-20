-- Read-only material usage report under Central kitchen.

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values (
  'kitchen.material_usage',
  '材料用量',
  '/kitchen/material-usage',
  57,
  false,
  'kitchen',
  'subpage'
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
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  'kitchen.material_usage',
  case
    when roles.role in ('Super Admin', 'Admin', 'Factory') then true
    when parent_perm.can_access is not null then parent_perm.can_access
    else false
  end,
  roles.role = 'Super Admin'
from roles
left join public.role_page_permissions parent_perm
  on parent_perm.role = roles.role
 and parent_perm.page_key = 'kitchen'
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();

-- These tables already grant authenticated access. Add narrowly scoped SELECT
-- policies so any role explicitly granted this read-only page can load the
-- report without changing existing page policies.
grant select on public.order_bom_requirements, public.ingredients,
  public.ingredient_stocktake_events, public.products to authenticated;

drop policy if exists "Kitchen material usage readers read BOM"
  on public.order_bom_requirements;
create policy "Kitchen material usage readers read BOM"
on public.order_bom_requirements
for select to authenticated
using (private.has_page_access('kitchen.material_usage'));

drop policy if exists "Kitchen material usage readers read ingredients"
  on public.ingredients;
create policy "Kitchen material usage readers read ingredients"
on public.ingredients
for select to authenticated
using (private.has_page_access('kitchen.material_usage'));

drop policy if exists "Kitchen material usage readers read stocktakes"
  on public.ingredient_stocktake_events;
create policy "Kitchen material usage readers read stocktakes"
on public.ingredient_stocktake_events
for select to authenticated
using (private.has_page_access('kitchen.material_usage'));

drop policy if exists "Kitchen material usage readers read products"
  on public.products;
create policy "Kitchen material usage readers read products"
on public.products
for select to authenticated
using (private.has_page_access('kitchen.material_usage'));

-- The report filters BOM records by delivery time and groups them by material.
create index if not exists order_bom_requirements_delivery_ingredient_idx
  on public.order_bom_requirements (delivery_at, ingredient_id)
  where ingredient_id is not null;

create index if not exists ingredient_stocktake_events_date_ingredient_idx
  on public.ingredient_stocktake_events (stocktake_at, ingredient_id)
  where ingredient_id is not null;
