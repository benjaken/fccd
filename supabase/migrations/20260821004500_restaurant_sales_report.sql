-- Restaurant sales report grouped by month, day, or week and by platform,
-- department, or service period.

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
  (
    'reports.shops',
    '店舖',
    '/reports/shops',
    98,
    false,
    'reports',
    'subpage'
  ),
  (
    'reports.shop_sales',
    '銷售報告',
    '/reports/tabs/shop-sales',
    98,
    false,
    'reports.shops',
    'tab'
  ),
  (
    'reports.shop_sales_working_hours',
    '銷售及工時報告',
    '/reports/tabs/shop-sales-working-hours',
    99,
    false,
    'reports.shops',
    'tab'
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
    ('Super Admin'),
    ('Admin'),
    ('Accounting'),
    ('Factory'),
    ('Shop manager'),
    ('Customer_Main'),
    ('Customer_Sub')
),
pages(page_key) as (
  values
    ('reports.shops'),
    ('reports.shop_sales'),
    ('reports.shop_sales_working_hours')
)
insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  roles.role,
  pages.page_key,
  roles.role in ('Super Admin', 'Admin', 'Accounting', 'Shop manager'),
  roles.role = 'Super Admin'
from roles
cross join pages
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

create or replace function public.report_restaurant_sales(
  p_start_date date,
  p_end_date date,
  p_period text default 'month',
  p_category text default 'platform'
)
returns table (
  bucket_start date,
  restaurant_id uuid,
  restaurant_name text,
  restaurant_order numeric,
  category_key text,
  category_name text,
  category_order numeric,
  amount numeric
)
language sql
stable
set search_path = public
as $$
  with source as (
    select
      case p_period
        when 'day' then (sales.sales_at at time zone 'Asia/Hong_Kong')::date
        when 'week' then date_trunc(
          'week',
          sales.sales_at at time zone 'Asia/Hong_Kong'
        )::date
        else date_trunc(
          'month',
          sales.sales_at at time zone 'Asia/Hong_Kong'
        )::date
      end as bucket_start,
      restaurant.id as restaurant_id,
      restaurant.name as restaurant_name,
      0::numeric as restaurant_order,
      case p_category
        when 'platform' then case
          when sales.delivery_platform_id is not null
            then 'platform:' || sales.delivery_platform_id::text
          when sales.delivery_platform_legacy_id is not null then 'other'
          else 'shop_sales'
        end
        when 'department' then coalesce(
          'department:' || sales.restaurant_department_id::text,
          'other'
        )
        else coalesce(
          'service_period:' || sales.service_period_id::text,
          'other'
        )
      end as category_key,
      case p_category
        when 'platform' then case
          when sales.delivery_platform_id is not null
            then coalesce(platform.name, '其他')
          when sales.delivery_platform_legacy_id is not null then '其他'
          else '店舖銷售'
        end
        when 'department' then coalesce(department.name, '其他')
        else coalesce(period.name, '其他')
      end as category_name,
      case p_category
        when 'platform' then case
          when sales.delivery_platform_id is null
            and sales.delivery_platform_legacy_id is null then -1000
          when sales.delivery_platform_id is null then 9999
          else coalesce(platform.sort_order, 0)
        end
        when 'department' then coalesce(department.sort_order, 9999)
        else coalesce(period.sort_order, 9999)
      end as category_order,
      coalesce(sales.amount, 0) as amount
    from public.restaurant_daily_sales sales
    join public.restaurants restaurant on restaurant.id = sales.restaurant_id
    left join public.restaurant_delivery_platforms platform
      on platform.id = sales.delivery_platform_id
    left join public.restaurant_departments department
      on department.id = sales.restaurant_department_id
    left join public.restaurant_service_periods period
      on period.id = sales.service_period_id
    where sales.sales_at is not null
      and (sales.sales_at at time zone 'Asia/Hong_Kong')::date
        between p_start_date and p_end_date
      and not sales.is_control_total
      and not sales.is_remark_section
      and sales.amount is not null
      and p_start_date <= p_end_date
      and p_period in ('month', 'day', 'week')
      and p_category in ('platform', 'department', 'service_period')
  )
  select
    source.bucket_start,
    source.restaurant_id,
    source.restaurant_name,
    source.restaurant_order,
    source.category_key,
    source.category_name,
    source.category_order,
    sum(source.amount)::numeric as amount
  from source
  group by
    source.bucket_start,
    source.restaurant_id,
    source.restaurant_name,
    source.restaurant_order,
    source.category_key,
    source.category_name,
    source.category_order
  order by
    source.bucket_start,
    source.restaurant_order,
    source.restaurant_name,
    source.category_order,
    source.category_name;
$$;

revoke all on function public.report_restaurant_sales(date, date, text, text)
  from public;
grant execute on function public.report_restaurant_sales(date, date, text, text)
  to authenticated;

comment on function public.report_restaurant_sales(date, date, text, text) is
  'Aggregates restaurant sales by month/day/week and platform/department/service period for the restaurant sales report.';
