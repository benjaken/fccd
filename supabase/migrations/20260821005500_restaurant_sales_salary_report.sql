-- Monthly restaurant revenue, salary expense, and salary-to-revenue ratio.

insert into public.app_pages (
  page_key,
  display_name,
  route,
  sort_order,
  is_high_risk,
  parent_page_key,
  page_kind
)
values (
  'reports.restaurant_sales_salary',
  '銷售及薪金報告',
  '/reports/tabs/restaurant-sales-salary',
  100,
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
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  'reports.restaurant_sales_salary',
  roles.role in ('Super Admin', 'Admin', 'Accounting', 'Shop manager'),
  roles.role = 'Super Admin'
from roles
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

create or replace function public.report_restaurant_sales_salary(
  p_start_month date,
  p_end_month date,
  p_restaurant_ids uuid[] default null
)
returns table (
  month_start date,
  restaurant_id uuid,
  restaurant_name text,
  sales numeric,
  salary numeric,
  salary_to_sales_percent numeric
)
language sql
stable
set search_path = public
as $$
  with selected_restaurants as (
    select restaurant.id, restaurant.name
    from public.restaurants restaurant
    where restaurant.is_active
      and restaurant.archived_at is null
      and (
        p_restaurant_ids is null
        or restaurant.id = any(p_restaurant_ids)
      )
  ),
  months as (
    select generate_series(
      date_trunc('month', p_start_month::timestamp),
      date_trunc('month', p_end_month::timestamp),
      interval '1 month'
    )::date as month_start
    where p_start_month <= p_end_month
  ),
  sales as (
    select
      date_trunc(
        'month',
        daily.sales_at at time zone 'Asia/Hong_Kong'
      )::date as month_start,
      daily.restaurant_id,
      sum(coalesce(daily.amount, 0))::numeric as amount
    from public.restaurant_daily_sales daily
    where daily.restaurant_id in (select id from selected_restaurants)
      and daily.sales_at is not null
      and (daily.sales_at at time zone 'Asia/Hong_Kong')::date
        >= date_trunc('month', p_start_month::timestamp)::date
      and (daily.sales_at at time zone 'Asia/Hong_Kong')::date
        < (date_trunc('month', p_end_month::timestamp) + interval '1 month')::date
      -- One control-total row stores the restaurant's daily revenue. Other
      -- sales rows are breakdowns of that same amount and must not be added
      -- together or revenue would be counted several times.
      and daily.is_control_total
      and not daily.is_remark_section
      and daily.amount is not null
    group by 1, 2
  ),
  salary as (
    select
      date_trunc(
        'month',
        monthly.month_at at time zone 'Asia/Hong_Kong'
      )::date as month_start,
      monthly.restaurant_id,
      sum(coalesce(monthly.amount, 0))::numeric as amount
    from public.restaurant_monthly_costs monthly
    left join public.restaurant_costs cost on cost.id = monthly.cost_id
    left join public.restaurant_cost_types cost_type
      on cost_type.id = monthly.cost_type_id
    where monthly.restaurant_id in (select id from selected_restaurants)
      and monthly.month_at is not null
      and (monthly.month_at at time zone 'Asia/Hong_Kong')::date
        >= date_trunc('month', p_start_month::timestamp)::date
      and (monthly.month_at at time zone 'Asia/Hong_Kong')::date
        < (date_trunc('month', p_end_month::timestamp) + interval '1 month')::date
      and lower(concat_ws(' ', cost.name, cost_type.name))
        ~ '(薪金|薪酬|人工|工資|工资|salary|salaries|wage|payroll)'
    group by 1, 2
  )
  select
    months.month_start,
    restaurant.id as restaurant_id,
    restaurant.name as restaurant_name,
    coalesce(sales.amount, 0)::numeric as sales,
    salary.amount::numeric as salary,
    case
      when salary.amount is null or coalesce(sales.amount, 0) = 0 then null
      else round(salary.amount / sales.amount * 100, 2)
    end::numeric as salary_to_sales_percent
  from months
  cross join selected_restaurants restaurant
  left join sales
    on sales.month_start = months.month_start
    and sales.restaurant_id = restaurant.id
  left join salary
    on salary.month_start = months.month_start
    and salary.restaurant_id = restaurant.id
  order by months.month_start, restaurant.name;
$$;

revoke all on function public.report_restaurant_sales_salary(date, date, uuid[])
  from public;
grant execute on function public.report_restaurant_sales_salary(date, date, uuid[])
  to authenticated;

comment on function public.report_restaurant_sales_salary(date, date, uuid[]) is
  'Returns monthly restaurant revenue, salary expense, and salary-to-revenue percentage for the selected restaurants.';
