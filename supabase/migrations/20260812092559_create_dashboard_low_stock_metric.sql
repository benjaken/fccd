create or replace function public.get_dashboard_low_stock_count()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  with stocktake_events as (
    select
      ingredient_id,
      stocktake_at,
      quantity
    from public.ingredient_stocktake_events
    where ingredient_id is not null

    union all

    select
      ingredient_id,
      stocktake_at,
      quantity
    from public.packing_stocktake_events
    where ingredient_id is not null
  ),
  latest_stocktake as (
    select distinct on (ingredient_id)
      ingredient_id,
      quantity
    from stocktake_events
    order by ingredient_id, stocktake_at desc nulls last
  )
  select count(*)::bigint
  from latest_stocktake
  where quantity <= 0;
$$;

comment on function public.get_dashboard_low_stock_count() is
  'Counts ingredients whose latest visible stocktake quantity is zero or negative. Runs with caller RLS.';

revoke all on function public.get_dashboard_low_stock_count()
  from public, anon;
grant execute on function public.get_dashboard_low_stock_count()
  to authenticated;
