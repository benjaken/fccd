-- Add the data source for the sales and working-hours tab registered by the
-- preceding shop-report migration.

create or replace function public.report_shop_sales_working_hours(
  p_start_date date,
  p_end_date date,
  p_restaurant_ids uuid[] default null
)
returns table (
  report_date date,
  restaurant_id uuid,
  restaurant_name text,
  department_name text,
  department_order integer,
  sales numeric,
  working_hours numeric,
  sales_per_working_hour numeric
)
language sql
stable
set search_path = public
as $$
  with source as (
    select
      (daily.sales_at at time zone 'Asia/Hong_Kong')::date as report_date,
      restaurant.id as restaurant_id,
      restaurant.name as restaurant_name,
      daily.manager_hours_department as department_name,
      case daily.manager_hours_department
        when '樓面' then 1
        when '廚房' then 2
        when '水吧' then 3
        else 9999
      end as department_order,
      coalesce(daily.working_hours, 0) as working_hours,
      coalesce(
        daily.average_per_working_hour * daily.working_hours,
        0
      ) as sales
    from public.restaurant_daily_sales daily
    join public.restaurants restaurant on restaurant.id = daily.restaurant_id
    where daily.sales_at is not null
      and daily.manager_hours_department is not null
      and daily.working_hours is not null
      and (daily.sales_at at time zone 'Asia/Hong_Kong')::date
        between p_start_date and p_end_date
      and p_start_date <= p_end_date
      and (
        p_restaurant_ids is null
        or cardinality(p_restaurant_ids) = 0
        or daily.restaurant_id = any(p_restaurant_ids)
      )
  ),
  totals as (
    select
      source.report_date,
      source.restaurant_id,
      source.restaurant_name,
      source.department_name,
      source.department_order,
      round(sum(source.sales), 2) as sales,
      sum(source.working_hours) as working_hours
    from source
    group by
      source.report_date,
      source.restaurant_id,
      source.restaurant_name,
      source.department_name,
      source.department_order
  )
  select
    totals.report_date,
    totals.restaurant_id,
    totals.restaurant_name,
    totals.department_name,
    totals.department_order,
    totals.sales,
    totals.working_hours,
    case
      when totals.working_hours = 0 then 0
      else round(totals.sales / totals.working_hours, 2)
    end as sales_per_working_hour
  from totals
  order by
    totals.restaurant_name,
    totals.report_date,
    totals.department_order,
    totals.department_name;
$$;

revoke all on function public.report_shop_sales_working_hours(date, date, uuid[])
  from public, anon;
grant execute on function public.report_shop_sales_working_hours(date, date, uuid[])
  to authenticated, service_role;

comment on function public.report_shop_sales_working_hours(date, date, uuid[]) is
  'Returns one daily sales and working-hours row per selected restaurant and manager-hours department.';
