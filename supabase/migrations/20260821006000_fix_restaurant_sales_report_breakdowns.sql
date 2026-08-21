-- Keep the restaurant sales total separate from its three alternative
-- breakdowns. Legacy platform rows were imported without their platform FK,
-- but retain the platform's configured sort order.

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
          'week', sales.sales_at at time zone 'Asia/Hong_Kong'
        )::date
        else date_trunc(
          'month', sales.sales_at at time zone 'Asia/Hong_Kong'
        )::date
      end as bucket_start,
      sales.*,
      restaurant.name as restaurant_name
    from public.restaurant_daily_sales sales
    join public.restaurants restaurant on restaurant.id = sales.restaurant_id
    where sales.sales_at is not null
      and (sales.sales_at at time zone 'Asia/Hong_Kong')::date
        between p_start_date and p_end_date
      and p_start_date <= p_end_date
      and p_period in ('month', 'day', 'week')
      and p_category in ('platform', 'department', 'service_period')
  ),
  bucket_restaurants as (
    select distinct bucket_start, restaurant_id, restaurant_name
    from source
  ),
  totals as (
    select bucket_start, restaurant_id, sum(amount)::numeric as amount
    from source
    where is_control_total and amount is not null
    group by bucket_start, restaurant_id
  ),
  platform_definitions as (
    select platform.*
    from public.restaurant_delivery_platforms platform
    where platform.is_active and platform.archived_at is null
  ),
  platform_amounts as (
    select
      source.bucket_start,
      source.restaurant_id,
      platform.id as category_id,
      sum(source.amount)::numeric as amount
    from source
    join platform_definitions platform on
      source.delivery_platform_id = platform.id
      or (
        source.delivery_platform_id is null
        and source.delivery_platform_legacy_id = platform.legacy_id
      )
      or (
        source.delivery_platform_id is null
        and source.delivery_platform_legacy_id is null
        and source.payment_method_id is null
        and source.payment_method_legacy_id is null
        and source.service_period_id is null
        and source.service_period_legacy_id is null
        and source.restaurant_department_id is null
        and source.restaurant_department_legacy_id is null
        and source.new_product_id is null
        and source.new_product_legacy_id is null
        and source.manager_hours_department is null
        and not source.petty_cash
        and source.sort_order = platform.sort_order
      )
    where not source.is_control_total
      and not source.is_remark_section
      and source.amount is not null
    group by source.bucket_start, source.restaurant_id, platform.id
  ),
  platform_totals as (
    select bucket_start, restaurant_id, sum(amount)::numeric as amount
    from platform_amounts
    group by bucket_start, restaurant_id
  ),
  platform_rows as (
    select
      bucket.bucket_start,
      bucket.restaurant_id,
      bucket.restaurant_name,
      ('platform:' || platform.id::text)::text as category_key,
      platform.name::text as category_name,
      coalesce(platform.sort_order, 9999)::numeric as category_order,
      coalesce(amount.amount, 0)::numeric as amount
    from bucket_restaurants bucket
    cross join platform_definitions platform
    left join platform_amounts amount
      on amount.bucket_start = bucket.bucket_start
      and amount.restaurant_id = bucket.restaurant_id
      and amount.category_id = platform.id
  ),
  shop_rows as (
    select
      bucket.bucket_start,
      bucket.restaurant_id,
      bucket.restaurant_name,
      'shop_sales'::text as category_key,
      '店舖銷售'::text as category_name,
      (-1000)::numeric as category_order,
      (
        coalesce(total.amount, platform_total.amount, 0)
        - coalesce(platform_total.amount, 0)
      )::numeric as amount
    from bucket_restaurants bucket
    left join totals total
      on total.bucket_start = bucket.bucket_start
      and total.restaurant_id = bucket.restaurant_id
    left join platform_totals platform_total
      on platform_total.bucket_start = bucket.bucket_start
      and platform_total.restaurant_id = bucket.restaurant_id
  ),
  department_amounts as (
    select
      source.bucket_start,
      source.restaurant_id,
      department.id as category_id,
      sum(source.amount)::numeric as amount
    from source
    join public.restaurant_departments department on
      source.restaurant_department_id = department.id
      or (
        source.restaurant_department_id is null
        and source.restaurant_department_legacy_id = department.legacy_id
      )
    where not source.is_control_total
      and not source.is_remark_section
      and source.amount is not null
    group by source.bucket_start, source.restaurant_id, department.id
  ),
  department_rows as (
    select
      bucket.bucket_start,
      bucket.restaurant_id,
      bucket.restaurant_name,
      ('department:' || department.id::text)::text as category_key,
      department.name::text as category_name,
      coalesce(department.sort_order, 9999)::numeric as category_order,
      coalesce(amount.amount, 0)::numeric as amount
    from bucket_restaurants bucket
    cross join public.restaurant_departments department
    left join department_amounts amount
      on amount.bucket_start = bucket.bucket_start
      and amount.restaurant_id = bucket.restaurant_id
      and amount.category_id = department.id
    where department.is_active and department.archived_at is null
  ),
  period_amounts as (
    select
      source.bucket_start,
      source.restaurant_id,
      period.id as category_id,
      sum(source.amount)::numeric as amount
    from source
    join public.restaurant_service_periods period on
      source.service_period_id = period.id
      or (
        source.service_period_id is null
        and source.service_period_legacy_id = period.legacy_id
      )
    where not source.is_control_total
      and not source.is_remark_section
      and source.amount is not null
    group by source.bucket_start, source.restaurant_id, period.id
  ),
  period_rows as (
    select
      bucket.bucket_start,
      bucket.restaurant_id,
      bucket.restaurant_name,
      ('service_period:' || period.id::text)::text as category_key,
      period.name::text as category_name,
      coalesce(period.sort_order, 9999)::numeric as category_order,
      coalesce(amount.amount, 0)::numeric as amount
    from bucket_restaurants bucket
    cross join public.restaurant_service_periods period
    left join period_amounts amount
      on amount.bucket_start = bucket.bucket_start
      and amount.restaurant_id = bucket.restaurant_id
      and amount.category_id = period.id
    where period.is_active and period.archived_at is null
  ),
  category_rows as (
    select * from platform_rows where p_category = 'platform'
    union all
    select * from shop_rows where p_category = 'platform'
    union all
    select * from department_rows where p_category = 'department'
    union all
    select * from period_rows where p_category = 'service_period'
  ),
  result_rows as (
    select
      category.bucket_start,
      category.restaurant_id,
      category.restaurant_name,
      0::numeric as restaurant_order,
      category.category_key,
      category.category_name,
      category.category_order,
      category.amount
    from category_rows category
    union all
    select
      bucket.bucket_start,
      bucket.restaurant_id,
      bucket.restaurant_name,
      0::numeric as restaurant_order,
      '__total__'::text as category_key,
      '總營業額'::text as category_name,
      (-10000)::numeric as category_order,
      total.amount
    from bucket_restaurants bucket
    join totals total
      on total.bucket_start = bucket.bucket_start
      and total.restaurant_id = bucket.restaurant_id
  )
  select result.*
  from result_rows result
  order by
    result.bucket_start,
    result.restaurant_order,
    result.restaurant_name,
    result.category_order,
    result.category_name;
$$;

comment on function public.report_restaurant_sales(date, date, text, text) is
  'Returns control totals and exactly one selected sales breakdown. Legacy platform rows are restored from configured sort order.';
