-- Aggregate each new product across the whole selected date range and rank by
-- quantity sold, instead of returning one row per product per day.

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
