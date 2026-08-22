-- Daily restaurant sales input page and its page-scoped write permission.
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
  ('restaurant.daily_sales', '每日銷售輸入', '/restaurant/daily-sales', 61, false, 'restaurant', 'subpage'),
  ('restaurant.daily_sales.edit', '新增及編輯每日銷售', '/restaurant/daily-sales/actions/edit', 62, true, 'restaurant.daily_sales', 'action')
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
    ('Super Admin'),
    ('Admin'),
    ('Accounting'),
    ('Factory'),
    ('Shop manager'),
    ('Customer_Main'),
    ('Customer_Sub')
),
pages(page_key) as (
  values ('restaurant.daily_sales'), ('restaurant.daily_sales.edit')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  pages.page_key,
  case
    when pages.page_key = 'restaurant.daily_sales'
      then roles.role in ('Super Admin', 'Admin', 'Accounting', 'Shop manager')
    else roles.role in ('Super Admin', 'Admin', 'Shop manager')
  end,
  roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

drop policy if exists "Daily sales input restaurant readers" on public.restaurants;
create policy "Daily sales input restaurant readers"
  on public.restaurants for select to authenticated
  using (private.has_page_access('restaurant.daily_sales'));
drop policy if exists "Daily sales input payment method readers" on public.restaurant_payment_methods;
create policy "Daily sales input payment method readers"
  on public.restaurant_payment_methods for select to authenticated
  using (private.has_page_access('restaurant.daily_sales'));
drop policy if exists "Daily sales input platform readers" on public.restaurant_delivery_platforms;
create policy "Daily sales input platform readers"
  on public.restaurant_delivery_platforms for select to authenticated
  using (private.has_page_access('restaurant.daily_sales'));
drop policy if exists "Daily sales input department readers" on public.restaurant_departments;
create policy "Daily sales input department readers"
  on public.restaurant_departments for select to authenticated
  using (private.has_page_access('restaurant.daily_sales'));
drop policy if exists "Daily sales input service period readers" on public.restaurant_service_periods;
create policy "Daily sales input service period readers"
  on public.restaurant_service_periods for select to authenticated
  using (private.has_page_access('restaurant.daily_sales'));
drop policy if exists "Daily sales input new product readers" on public.restaurant_new_products;
create policy "Daily sales input new product readers"
  on public.restaurant_new_products for select to authenticated
  using (private.has_page_access('restaurant.daily_sales'));

drop policy if exists "Daily sales input readers" on public.restaurant_daily_sales;
create policy "Daily sales input readers"
  on public.restaurant_daily_sales for select to authenticated
  using (private.has_page_access('restaurant.daily_sales'));
drop policy if exists "Daily sales input inserts" on public.restaurant_daily_sales;
create policy "Daily sales input inserts"
  on public.restaurant_daily_sales for insert to authenticated
  with check (private.has_page_access('restaurant.daily_sales.edit'));
drop policy if exists "Daily sales input updates" on public.restaurant_daily_sales;
create policy "Daily sales input updates"
  on public.restaurant_daily_sales for update to authenticated
  using (private.has_page_access('restaurant.daily_sales.edit'))
  with check (private.has_page_access('restaurant.daily_sales.edit'));
drop policy if exists "Daily sales input deletes" on public.restaurant_daily_sales;
create policy "Daily sales input deletes"
  on public.restaurant_daily_sales for delete to authenticated
  using (private.has_page_access('restaurant.daily_sales.edit'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-sales-receipts',
  'restaurant-sales-receipts',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Daily sales receipt readers" on storage.objects;
create policy "Daily sales receipt readers"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'restaurant-sales-receipts'
    and private.has_page_access('restaurant.daily_sales')
  );
drop policy if exists "Daily sales receipt uploads" on storage.objects;
create policy "Daily sales receipt uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'restaurant-sales-receipts'
    and private.has_page_access('restaurant.daily_sales.edit')
  );
