-- Restaurant new-product report and settings permissions.

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values
  ('reports.new_products', '新品報告', '/reports/tabs/new-products', 102, false, 'reports.shops', 'tab'),
  ('restaurant.settings.new_products', '新品設定', '/restaurant/settings/new-products', 90, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.new_products.edit', '新增/編輯新品', '/restaurant/settings/new-products/actions/edit', 91, true, 'restaurant.settings.new_products', 'action'),
  ('restaurant.settings.new_products.delete', '刪除新品', '/restaurant/settings/new-products/actions/delete', 92, true, 'restaurant.settings.new_products', 'action')
on conflict (page_key) do update set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

with roles(role) as (
  values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'),
    ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
),
pages(page_key) as (
  values
    ('reports.new_products'),
    ('restaurant.settings.new_products'),
    ('restaurant.settings.new_products.edit'),
    ('restaurant.settings.new_products.delete')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  pages.page_key,
  case
    when pages.page_key in (
      'reports.new_products',
      'restaurant.settings.new_products'
    )
      then roles.role in ('Super Admin', 'Admin', 'Accounting', 'Shop manager')
    else roles.role in ('Super Admin', 'Admin')
  end,
  roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

create or replace function public.report_restaurant_new_products(
  p_start_date date,
  p_end_date date,
  p_offset integer default 0,
  p_limit integer default 20
)
returns table (
  sale_date date,
  product_id uuid,
  product_name text,
  quantity numeric,
  total_count bigint
)
language sql
stable
set search_path = public
as $$
  with aggregated as (
    select
      coalesce(product.id, legacy_product.id) as product_id,
      coalesce(product.name, legacy_product.name) as product_name,
      sum(coalesce(sales.quantity, 0)) as quantity
    from public.restaurant_daily_sales sales
    left join public.restaurant_new_products product
      on product.id = sales.new_product_id
    left join public.restaurant_new_products legacy_product
      on sales.new_product_id is null
      and legacy_product.legacy_id = sales.new_product_legacy_id
    where sales.sales_at >= p_start_date::timestamp at time zone 'Asia/Hong_Kong'
      and sales.sales_at < (p_end_date + 1)::timestamp at time zone 'Asia/Hong_Kong'
      and coalesce(product.id, legacy_product.id) is not null
      and coalesce(product.archived_at, legacy_product.archived_at) is null
    group by 1, 2
  )
  select
    p_start_date as sale_date,
    aggregated.product_id,
    aggregated.product_name,
    aggregated.quantity,
    count(*) over () as total_count
  from aggregated
  order by aggregated.quantity desc, aggregated.product_name
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.report_restaurant_new_products(date, date, integer, integer)
  to authenticated;
