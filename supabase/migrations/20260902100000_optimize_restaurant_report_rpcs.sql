-- Optimize the restaurant sales-cost and P&L report RPCs.
--
-- Both original functions ran correlated scans for every requested month. The
-- functional indexes below match the report's Hong Kong calendar-day filters,
-- while the replacement functions aggregate each source table once per call.

create index if not exists restaurant_daily_sales_report_hkt_idx
  on public.restaurant_daily_sales (
    restaurant_id,
    ((sales_at at time zone 'Asia/Hong_Kong')::date)
  )
  include (amount, is_control_total, is_remark_section, restaurant_department_id)
  where sales_at is not null;

create index if not exists restaurant_supplier_purchases_report_hkt_idx
  on public.restaurant_supplier_purchases (
    restaurant_id,
    ((purchased_at at time zone 'Asia/Hong_Kong')::date)
  )
  include (amount, purchase_type_id)
  where purchased_at is not null;

create index if not exists restaurant_stocktake_events_report_hkt_idx
  on public.restaurant_stocktake_events (
    restaurant_id,
    ((stocktake_at at time zone 'Asia/Hong_Kong')::date),
    department_name
  )
  include (total_cost)
  where stocktake_at is not null;

create index if not exists restaurant_monthly_costs_report_hkt_idx
  on public.restaurant_monthly_costs (
    restaurant_id,
    ((month_at at time zone 'Asia/Hong_Kong')::date),
    cost_id
  )
  include (amount)
  where month_at is not null and can_proceed_pnl;

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
  with date_bounds as (
    select
      date_trunc('month', p_start_month::timestamp)::date as start_date,
      (date_trunc('month', p_end_month::timestamp) + interval '1 month')::date as end_date
  ),
  selected_restaurant as (
    select restaurant.id, restaurant.name
    from public.restaurants restaurant
    where restaurant.id = p_restaurant_id
      and restaurant.archived_at is null
  ),
  months as (
    select generate_series(
      date_bounds.start_date,
      (date_bounds.end_date - interval '1 month')::date,
      interval '1 month'
    )::date as month_start
    from date_bounds
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
    cross join date_bounds
    where daily.restaurant_id = p_restaurant_id
      and daily.sales_at is not null
      and (daily.sales_at at time zone 'Asia/Hong_Kong')::date >= date_bounds.start_date
      and (daily.sales_at at time zone 'Asia/Hong_Kong')::date < date_bounds.end_date
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
    cross join date_bounds
    where purchase.restaurant_id = p_restaurant_id
      and purchase.purchased_at is not null
      and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date >= date_bounds.start_date
      and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date < date_bounds.end_date
    group by 1, 2
  ),
  stocktake_daily as materialized (
    select
      stock.restaurant_id,
      (stock.stocktake_at at time zone 'Asia/Hong_Kong')::date as stocktake_date,
      sum(coalesce(stock.total_cost, 0)) filter (
        where coalesce(stock.department_name, '廚房') <> '水吧'
      )::numeric as restaurant_total,
      count(*) filter (
        where coalesce(stock.department_name, '廚房') <> '水吧'
      ) as restaurant_row_count,
      sum(coalesce(stock.total_cost, 0)) filter (
        where stock.department_name = '水吧'
      )::numeric as water_bar_total,
      count(*) filter (
        where stock.department_name = '水吧'
      ) as water_bar_row_count
    from public.restaurant_stocktake_events stock
    cross join date_bounds
    where stock.restaurant_id = p_restaurant_id
      and stock.stocktake_at is not null
      and (stock.stocktake_at at time zone 'Asia/Hong_Kong')::date < date_bounds.end_date
    group by 1, 2
  ),
  stocktake_dates as (
    select
      months.month_start,
      max(stock.stocktake_date) filter (
        where stock.restaurant_row_count > 0
          and stock.stocktake_date < months.month_start
      ) as opening_restaurant_date,
      max(stock.stocktake_date) filter (
        where stock.water_bar_row_count > 0
          and stock.stocktake_date < months.month_start
      ) as opening_water_bar_date,
      max(stock.stocktake_date) filter (
        where stock.restaurant_row_count > 0
          and stock.stocktake_date < (months.month_start + interval '1 month')::date
      ) as closing_restaurant_date,
      max(stock.stocktake_date) filter (
        where stock.water_bar_row_count > 0
          and stock.stocktake_date < (months.month_start + interval '1 month')::date
      ) as closing_water_bar_date
    from months
    left join stocktake_daily stock
      on stock.stocktake_date < (months.month_start + interval '1 month')::date
    group by months.month_start
  )
  select
    months.month_start,
    restaurant.id,
    restaurant.name,
    coalesce(sales.restaurant_sales, 0),
    coalesce(sales.department_total, 0) - coalesce(sales.restaurant_sales, 0),
    0::numeric,
    coalesce(opening_restaurant.restaurant_total, 0),
    coalesce(opening_water_bar.water_bar_total, 0),
    0::numeric,
    coalesce(purchases.restaurant_amount, 0),
    coalesce(purchases.water_bar_amount, 0),
    coalesce(purchases.misc_amount, 0),
    coalesce(closing_restaurant.restaurant_total, 0),
    coalesce(closing_water_bar.water_bar_total, 0),
    0::numeric
  from months
  cross join selected_restaurant restaurant
  left join sales
    on sales.month_start = months.month_start
    and sales.restaurant_id = restaurant.id
  left join purchases
    on purchases.month_start = months.month_start
    and purchases.restaurant_id = restaurant.id
  left join stocktake_dates dates
    on dates.month_start = months.month_start
  left join stocktake_daily opening_restaurant
    on opening_restaurant.stocktake_date = dates.opening_restaurant_date
  left join stocktake_daily opening_water_bar
    on opening_water_bar.stocktake_date = dates.opening_water_bar_date
  left join stocktake_daily closing_restaurant
    on closing_restaurant.stocktake_date = dates.closing_restaurant_date
  left join stocktake_daily closing_water_bar
    on closing_water_bar.stocktake_date = dates.closing_water_bar_date
  order by months.month_start;
$$;

create or replace function public.report_restaurant_pnl(
  p_start_month date,
  p_end_month date,
  p_restaurant_id uuid
)
returns table (
  month_start date,
  restaurant_id uuid,
  restaurant_name text,
  sales numeric,
  opening_stock numeric,
  purchases numeric,
  closing_stock numeric,
  category_key text,
  category_name text,
  category_order numeric,
  item_key text,
  item_name text,
  item_order numeric,
  amount numeric
)
language sql
stable
set search_path = public
as $$
  with date_bounds as (
    select
      date_trunc('month', p_start_month::timestamp)::date as start_date,
      (date_trunc('month', p_end_month::timestamp) + interval '1 month')::date as end_date
  ),
  selected_restaurant as (
    select restaurant.id, restaurant.name
    from public.restaurants restaurant
    where restaurant.id = p_restaurant_id
      and restaurant.archived_at is null
  ),
  months as (
    select generate_series(
      date_bounds.start_date,
      (date_bounds.end_date - interval '1 month')::date,
      interval '1 month'
    )::date as month_start
    from date_bounds
    where p_start_month <= p_end_month
  ),
  sales as (
    select
      date_trunc('month', daily.sales_at at time zone 'Asia/Hong_Kong')::date as month_start,
      sum(coalesce(daily.amount, 0))::numeric as sales
    from public.restaurant_daily_sales daily
    cross join date_bounds
    where daily.restaurant_id = p_restaurant_id
      and daily.is_control_total
      and not daily.is_remark_section
      and daily.sales_at is not null
      and (daily.sales_at at time zone 'Asia/Hong_Kong')::date >= date_bounds.start_date
      and (daily.sales_at at time zone 'Asia/Hong_Kong')::date < date_bounds.end_date
    group by 1
  ),
  purchases as (
    select
      date_trunc('month', purchase.purchased_at at time zone 'Asia/Hong_Kong')::date as month_start,
      sum(coalesce(purchase.amount, 0))::numeric as purchases
    from public.restaurant_supplier_purchases purchase
    cross join date_bounds
    where purchase.restaurant_id = p_restaurant_id
      and purchase.purchased_at is not null
      and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date >= date_bounds.start_date
      and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date < date_bounds.end_date
    group by 1
  ),
  stocktake_daily as materialized (
    select
      (stock.stocktake_at at time zone 'Asia/Hong_Kong')::date as stocktake_date,
      sum(coalesce(stock.total_cost, 0))::numeric as total_cost
    from public.restaurant_stocktake_events stock
    cross join date_bounds
    where stock.restaurant_id = p_restaurant_id
      and stock.stocktake_at is not null
      and (stock.stocktake_at at time zone 'Asia/Hong_Kong')::date < date_bounds.end_date
    group by 1
  ),
  stocktake_dates as (
    select
      months.month_start,
      max(stock.stocktake_date) filter (
        where stock.stocktake_date < months.month_start
      ) as opening_date,
      max(stock.stocktake_date) filter (
        where stock.stocktake_date < (months.month_start + interval '1 month')::date
      ) as closing_date
    from months
    left join stocktake_daily stock
      on stock.stocktake_date < (months.month_start + interval '1 month')::date
    group by months.month_start
  ),
  month_totals as (
    select
      months.month_start,
      restaurant.id as restaurant_id,
      restaurant.name as restaurant_name,
      coalesce(sales.sales, 0)::numeric as sales,
      coalesce(opening_stock.total_cost, 0)::numeric as opening_stock,
      coalesce(purchases.purchases, 0)::numeric as purchases,
      coalesce(closing_stock.total_cost, 0)::numeric as closing_stock
    from months
    cross join selected_restaurant restaurant
    left join sales
      on sales.month_start = months.month_start
    left join purchases
      on purchases.month_start = months.month_start
    left join stocktake_dates dates
      on dates.month_start = months.month_start
    left join stocktake_daily opening_stock
      on opening_stock.stocktake_date = dates.opening_date
    left join stocktake_daily closing_stock
      on closing_stock.stocktake_date = dates.closing_date
  ),
  catalog as (
    select
      coalesce(cost_type.id::text, cost.cost_type_legacy_id, 'uncategorized') as category_key,
      coalesce(cost_type.name, '其他營運開支') as category_name,
      coalesce(cost_type.sort_order, 9999)::numeric as category_order,
      cost.id::text as item_key,
      cost.name as item_name,
      coalesce(cost.sort_order, 9999)::numeric as item_order
    from public.restaurant_costs cost
    left join public.restaurant_cost_types cost_type on cost_type.id = cost.cost_type_id
    where cost.archived_at is null
      and cost.is_active
      and (cost_type.id is null or cost_type.archived_at is null)
  ),
  monthly_costs as (
    select
      date_trunc('month', monthly.month_at at time zone 'Asia/Hong_Kong')::date as month_start,
      monthly.restaurant_id,
      monthly.cost_id::text as item_key,
      sum(coalesce(monthly.amount, 0))::numeric as amount
    from public.restaurant_monthly_costs monthly
    cross join date_bounds
    where monthly.restaurant_id = p_restaurant_id
      and monthly.can_proceed_pnl
      and monthly.month_at is not null
      and (monthly.month_at at time zone 'Asia/Hong_Kong')::date >= date_bounds.start_date
      and (monthly.month_at at time zone 'Asia/Hong_Kong')::date < date_bounds.end_date
    group by 1, 2, 3
  ),
  report_rows as (
    select
      totals.*,
      catalog.category_key,
      catalog.category_name,
      catalog.category_order,
      catalog.item_key,
      catalog.item_name,
      catalog.item_order,
      coalesce(monthly_costs.amount, 0)::numeric as amount
    from month_totals totals
    cross join catalog
    left join monthly_costs
      on monthly_costs.month_start = totals.month_start
      and monthly_costs.restaurant_id = totals.restaurant_id
      and monthly_costs.item_key = catalog.item_key

    union all

    select
      totals.*,
      null::text, null::text, 0::numeric,
      null::text, null::text, 0::numeric, 0::numeric
    from month_totals totals
    where not exists (select 1 from catalog)
  )
  select *
  from report_rows
  order by month_start, category_order, category_name, item_order, item_name;
$$;

revoke all on function public.report_restaurant_sales_cost(date, date, uuid)
  from public, anon;
grant execute on function public.report_restaurant_sales_cost(date, date, uuid)
  to authenticated, service_role;

revoke all on function public.report_restaurant_pnl(date, date, uuid)
  from public, anon;
grant execute on function public.report_restaurant_pnl(date, date, uuid)
  to authenticated, service_role;
