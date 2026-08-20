-- Central-kitchen all-sales-and-costs report.
-- The report returns one row per year, month and category so the UI can
-- discover available years without hard-coding a date range.
-- Sales are grouped by delivery date; monthly costs come from monthly_costs.
-- advertising_costs is the weekly input source and must not be added here,
-- because those values are already represented by monthly cost rows.

create or replace function public.report_kitchen_sales_costs()
returns table (
  report_year integer,
  month_number integer,
  category_name text,
  amount numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with source_rows as (
    select
      o.delivery_at as occurred_at,
      'Sales'::text as category_name,
      coalesce(o.grand_total, 0)::numeric as amount
    from public.orders o
    where o.document_type = 'order'
      and o.archived_at is null
      and o.delivery_at is not null

    union all

    select
      mc.month_at as occurred_at,
      coalesce(nullif(btrim(ct.name), ''), 'Other cost') as category_name,
      coalesce(mc.non_peak_amount, 0)::numeric as amount
    from public.monthly_costs mc
    left join public.cost_types ct on ct.id = mc.cost_type_id
    where mc.month_at is not null
      and mc.non_peak_amount is not null

    union all

    select
      coalesce(mc.festival_range_start, mc.month_at) as occurred_at,
      coalesce(nullif(btrim(ct.name), ''), 'Other cost') as category_name,
      coalesce(mc.festival_amount, 0)::numeric as amount
    from public.monthly_costs mc
    left join public.cost_types ct on ct.id = mc.cost_type_id
    where coalesce(mc.festival_range_start, mc.month_at) is not null
      and mc.festival_amount is not null
  )
  select
    extract(year from occurred_at at time zone 'Asia/Hong_Kong')::integer as report_year,
    extract(month from occurred_at at time zone 'Asia/Hong_Kong')::integer as month_number,
    category_name,
    sum(amount)::numeric as amount
  from source_rows
  group by 1, 2, 3
  order by 1 desc, 2 asc, 3 asc;
$$;

revoke all on function public.report_kitchen_sales_costs() from public, anon;
grant execute on function public.report_kitchen_sales_costs() to authenticated;
