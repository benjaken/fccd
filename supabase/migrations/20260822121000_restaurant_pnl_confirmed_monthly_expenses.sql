-- Only explicitly confirmed monthly expenses are pushed into the P&L report.
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
  month_totals as (
    select
      months.month_start,
      restaurant.id as restaurant_id,
      restaurant.name as restaurant_name,
      coalesce((
        select sum(coalesce(daily.amount, 0))
        from public.restaurant_daily_sales daily
        where daily.restaurant_id = restaurant.id
          and daily.is_control_total
          and not daily.is_remark_section
          and daily.sales_at is not null
          and (daily.sales_at at time zone 'Asia/Hong_Kong')::date >= months.month_start
          and (daily.sales_at at time zone 'Asia/Hong_Kong')::date < months.month_start + interval '1 month'
      ), 0)::numeric as sales,
      coalesce((
        select sum(coalesce(stock.total_cost, 0))
        from public.restaurant_stocktake_events stock
        where stock.restaurant_id = restaurant.id
          and stock.stocktake_at is not null
          and (stock.stocktake_at at time zone 'Asia/Hong_Kong')::date = (
            select max((opening.stocktake_at at time zone 'Asia/Hong_Kong')::date)
            from public.restaurant_stocktake_events opening
            where opening.restaurant_id = restaurant.id
              and opening.stocktake_at is not null
              and (opening.stocktake_at at time zone 'Asia/Hong_Kong')::date < months.month_start
          )
      ), 0)::numeric as opening_stock,
      coalesce((
        select sum(coalesce(purchase.amount, 0))
        from public.restaurant_supplier_purchases purchase
        where purchase.restaurant_id = restaurant.id
          and purchase.purchased_at is not null
          and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date >= months.month_start
          and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date < months.month_start + interval '1 month'
      ), 0)::numeric as purchases,
      coalesce((
        select sum(coalesce(stock.total_cost, 0))
        from public.restaurant_stocktake_events stock
        where stock.restaurant_id = restaurant.id
          and stock.stocktake_at is not null
          and (stock.stocktake_at at time zone 'Asia/Hong_Kong')::date = (
            select max((closing.stocktake_at at time zone 'Asia/Hong_Kong')::date)
            from public.restaurant_stocktake_events closing
            where closing.restaurant_id = restaurant.id
              and closing.stocktake_at is not null
              and (closing.stocktake_at at time zone 'Asia/Hong_Kong')::date < months.month_start + interval '1 month'
          )
      ), 0)::numeric as closing_stock
    from months
    cross join selected_restaurant restaurant
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
    where monthly.restaurant_id = p_restaurant_id
      and monthly.can_proceed_pnl
      and monthly.month_at is not null
      and (monthly.month_at at time zone 'Asia/Hong_Kong')::date >= date_trunc('month', p_start_month::timestamp)::date
      and (monthly.month_at at time zone 'Asia/Hong_Kong')::date < date_trunc('month', p_end_month::timestamp)::date + interval '1 month'
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

revoke all on function public.report_restaurant_pnl(date, date, uuid)
  from public, anon;
grant execute on function public.report_restaurant_pnl(date, date, uuid)
  to authenticated, service_role;

comment on function public.report_restaurant_pnl(date, date, uuid) is
  'Returns monthly sales, stock-based cost of sales, and confirmed operating costs for one restaurant.';
