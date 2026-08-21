-- Monthly restaurant sales and cost-of-sales report, split by operation area.

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values (
  'reports.restaurant_sales_cost', '銷售成本報告',
  '/reports/tabs/restaurant-sales-cost', 100,
  false, 'reports.shops', 'tab'
)
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
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  'reports.restaurant_sales_cost',
  roles.role in ('Super Admin', 'Admin', 'Accounting', 'Shop manager'),
  roles.role = 'Super Admin'
from roles
on conflict (role, page_key) do update
set can_access = public.role_page_permissions.can_access or excluded.can_access,
    can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
    updated_at = now();

create or replace function public.report_restaurant_sales_cost(
  p_start_month date,
  p_end_month date,
  p_restaurant_id uuid
)
returns table (
  month_start date,
  restaurant_id uuid,
  restaurant_name text,
  sales_restaurant numeric,
  sales_water_bar numeric,
  sales_misc numeric,
  opening_restaurant numeric,
  opening_water_bar numeric,
  opening_misc numeric,
  purchases_restaurant numeric,
  purchases_water_bar numeric,
  purchases_misc numeric,
  closing_restaurant numeric,
  closing_water_bar numeric,
  closing_misc numeric
)
language sql
stable
set search_path = public
as $$
  with selected_restaurant as (
    select restaurant.id, restaurant.name
    from public.restaurants restaurant
    where restaurant.id = p_restaurant_id
      and restaurant.is_active
      and restaurant.archived_at is null
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
      date_trunc('month', daily.sales_at at time zone 'Asia/Hong_Kong')::date as month_start,
      daily.restaurant_id,
      sum(coalesce(daily.amount, 0)) filter (
        where not daily.is_control_total
          and not daily.is_remark_section
          and daily.restaurant_department_id is not null
      )::numeric as department_total,
      sum(coalesce(daily.amount, 0)) filter (
        where not daily.is_control_total
          and not daily.is_remark_section
          and department.name = '餐廳'
      )::numeric as restaurant_sales
    from public.restaurant_daily_sales daily
    left join public.restaurant_departments department
      on department.id = daily.restaurant_department_id
    where daily.restaurant_id = p_restaurant_id
      and daily.sales_at is not null
      and (daily.sales_at at time zone 'Asia/Hong_Kong')::date >= date_trunc('month', p_start_month::timestamp)::date
      and (daily.sales_at at time zone 'Asia/Hong_Kong')::date < date_trunc('month', p_end_month::timestamp)::date + interval '1 month'
    group by 1, 2
  ),
  purchases as (
    select
      date_trunc('month', purchase.purchased_at at time zone 'Asia/Hong_Kong')::date as month_start,
      purchase.restaurant_id,
      sum(coalesce(purchase.amount, 0)) filter (
        where purchase_type.name like '廚房%'
      )::numeric as restaurant_amount,
      sum(coalesce(purchase.amount, 0)) filter (
        where purchase_type.name like '水吧%'
      )::numeric as water_bar_amount,
      sum(coalesce(purchase.amount, 0)) filter (
        where purchase_type.name not like '廚房%'
          and purchase_type.name not like '水吧%'
      )::numeric as misc_amount
    from public.restaurant_supplier_purchases purchase
    left join public.restaurant_purchase_types purchase_type
      on purchase_type.id = purchase.purchase_type_id
    where purchase.restaurant_id = p_restaurant_id
      and purchase.purchased_at is not null
      and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date >= date_trunc('month', p_start_month::timestamp)::date
      and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date < date_trunc('month', p_end_month::timestamp)::date + interval '1 month'
    group by 1, 2
  )
  select
    months.month_start,
    restaurant.id,
    restaurant.name,
    coalesce(sales.restaurant_sales, 0),
    coalesce(sales.department_total, 0) - coalesce(sales.restaurant_sales, 0),
    0::numeric,
    coalesce((
      select sum(coalesce(stock.total_cost, 0))
      from public.restaurant_stocktake_events stock
      where stock.restaurant_id = restaurant.id
        and coalesce(stock.department_name, '廚房') <> '水吧'
        and (stock.stocktake_at at time zone 'Asia/Hong_Kong')::date = (
          select max((opening.stocktake_at at time zone 'Asia/Hong_Kong')::date)
          from public.restaurant_stocktake_events opening
          where opening.restaurant_id = restaurant.id
            and coalesce(opening.department_name, '廚房') <> '水吧'
            and (opening.stocktake_at at time zone 'Asia/Hong_Kong')::date < months.month_start
        )
    ), 0)::numeric,
    coalesce((
      select sum(coalesce(stock.total_cost, 0))
      from public.restaurant_stocktake_events stock
      where stock.restaurant_id = restaurant.id
        and stock.department_name = '水吧'
        and (stock.stocktake_at at time zone 'Asia/Hong_Kong')::date = (
          select max((opening.stocktake_at at time zone 'Asia/Hong_Kong')::date)
          from public.restaurant_stocktake_events opening
          where opening.restaurant_id = restaurant.id
            and opening.department_name = '水吧'
            and (opening.stocktake_at at time zone 'Asia/Hong_Kong')::date < months.month_start
        )
    ), 0)::numeric,
    0::numeric,
    coalesce(purchases.restaurant_amount, 0),
    coalesce(purchases.water_bar_amount, 0),
    coalesce(purchases.misc_amount, 0),
    coalesce((
      select sum(coalesce(stock.total_cost, 0))
      from public.restaurant_stocktake_events stock
      where stock.restaurant_id = restaurant.id
        and coalesce(stock.department_name, '廚房') <> '水吧'
        and (stock.stocktake_at at time zone 'Asia/Hong_Kong')::date = (
          select max((closing.stocktake_at at time zone 'Asia/Hong_Kong')::date)
          from public.restaurant_stocktake_events closing
          where closing.restaurant_id = restaurant.id
            and coalesce(closing.department_name, '廚房') <> '水吧'
            and (closing.stocktake_at at time zone 'Asia/Hong_Kong')::date < months.month_start + interval '1 month'
        )
    ), 0)::numeric,
    coalesce((
      select sum(coalesce(stock.total_cost, 0))
      from public.restaurant_stocktake_events stock
      where stock.restaurant_id = restaurant.id
        and stock.department_name = '水吧'
        and (stock.stocktake_at at time zone 'Asia/Hong_Kong')::date = (
          select max((closing.stocktake_at at time zone 'Asia/Hong_Kong')::date)
          from public.restaurant_stocktake_events closing
          where closing.restaurant_id = restaurant.id
            and closing.department_name = '水吧'
            and (closing.stocktake_at at time zone 'Asia/Hong_Kong')::date < months.month_start + interval '1 month'
        )
    ), 0)::numeric,
    0::numeric
  from months
  cross join selected_restaurant restaurant
  left join sales on sales.month_start = months.month_start
    and sales.restaurant_id = restaurant.id
  left join purchases on purchases.month_start = months.month_start
    and purchases.restaurant_id = restaurant.id
  order by months.month_start;
$$;

revoke all on function public.report_restaurant_sales_cost(date, date, uuid)
  from public, anon;
grant execute on function public.report_restaurant_sales_cost(date, date, uuid)
  to authenticated, service_role;

comment on function public.report_restaurant_sales_cost(date, date, uuid) is
  'Returns monthly restaurant sales, opening stock, purchases, closing stock, COS and gross-profit inputs split between restaurant, water bar and sundries.';
