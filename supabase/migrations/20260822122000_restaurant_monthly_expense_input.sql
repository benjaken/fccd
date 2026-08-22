-- Monthly restaurant expense input and explicit P&L readiness workflow.
insert into public.app_pages (
  page_key,
  display_name,
  route,
  sort_order,
  is_high_risk,
  parent_page_key,
  page_kind
)
values
  ('restaurant.monthly_expenses', '每月費用輸入', '/restaurant/monthly-expenses', 63, false, 'restaurant', 'subpage'),
  ('restaurant.monthly_expenses.edit', '新增及編輯每月費用', '/restaurant/monthly-expenses/actions/edit', 64, true, 'restaurant.monthly_expenses', 'action')
on conflict (page_key) do update
set display_name = excluded.display_name,
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
), pages(page_key) as (
  values ('restaurant.monthly_expenses'), ('restaurant.monthly_expenses.edit')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  pages.page_key,
  roles.role in ('Super Admin', 'Admin', 'Accounting', 'Shop manager'),
  roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update
set can_access = public.role_page_permissions.can_access or excluded.can_access,
    can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
    updated_at = now();

create policy "Monthly expense input restaurant readers"
  on public.restaurants for select to authenticated
  using (private.has_page_access('restaurant.monthly_expenses'));
create policy "Monthly expense input cost type readers"
  on public.restaurant_cost_types for select to authenticated
  using (private.has_page_access('restaurant.monthly_expenses'));
create policy "Monthly expense input cost readers"
  on public.restaurant_costs for select to authenticated
  using (private.has_page_access('restaurant.monthly_expenses'));
create policy "Monthly expense input readers"
  on public.restaurant_monthly_costs for select to authenticated
  using (private.has_page_access('restaurant.monthly_expenses'));
create policy "Monthly expense input inserts"
  on public.restaurant_monthly_costs for insert to authenticated
  with check (private.has_page_access('restaurant.monthly_expenses.edit'));
create policy "Monthly expense input updates"
  on public.restaurant_monthly_costs for update to authenticated
  using (private.has_page_access('restaurant.monthly_expenses.edit'))
  with check (private.has_page_access('restaurant.monthly_expenses.edit'));
