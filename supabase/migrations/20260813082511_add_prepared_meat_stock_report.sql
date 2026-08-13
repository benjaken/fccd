create function public.report_monthly_prepared_meat_stock(
  report_year integer
)
returns table (
  prepared_meat_item_id uuid,
  prepared_meat_name text,
  product_unit text,
  sort_order numeric,
  month_number integer,
  month_end_packages numeric,
  monthly_net_packages numeric
)
language sql
stable
set search_path = ''
as $$
  with report_months as (
    select month_start::date
    from generate_series(
      make_date(report_year, 1, 1),
      case
        when report_year <
          extract(year from now() at time zone 'Asia/Hong_Kong')::integer
          then make_date(report_year, 12, 1)
        when report_year =
          extract(year from now() at time zone 'Asia/Hong_Kong')::integer
          then date_trunc(
            'month',
            now() at time zone 'Asia/Hong_Kong'
          )::date
        else null
      end,
      interval '1 month'
    ) as month_start
  )
  select
    item.id as prepared_meat_item_id,
    item.name as prepared_meat_name,
    item.unit as product_unit,
    item.sort_order,
    extract(month from month.month_start)::integer as month_number,
    coalesce(
      sum(
        coalesce(movement.inbound_packages, 0)
        - coalesce(movement.outbound_packages, 0)
      ) filter (
        where movement.movement_at <
          ((month.month_start + interval '1 month')::timestamp
            at time zone 'Asia/Hong_Kong')
      ),
      0
    ) as month_end_packages,
    coalesce(
      sum(
        coalesce(movement.inbound_packages, 0)
        - coalesce(movement.outbound_packages, 0)
      ) filter (
        where movement.movement_at >=
            (month.month_start::timestamp at time zone 'Asia/Hong_Kong')
          and movement.movement_at <
            ((month.month_start + interval '1 month')::timestamp
              at time zone 'Asia/Hong_Kong')
      ),
      0
    ) as monthly_net_packages
  from public.prepared_meat_items as item
  cross join report_months as month
  left join public.prepared_meat_stock_movements as movement
    on movement.prepared_meat_item_id = item.id
  where item.archived_at is null
    and item.is_active
  group by
    item.id,
    item.name,
    item.unit,
    item.sort_order,
    month.month_start
  order by item.sort_order nulls last, item.name, month_number;
$$;

revoke all on function public.report_monthly_prepared_meat_stock(integer)
from public, anon;
grant execute on function public.report_monthly_prepared_meat_stock(integer)
to authenticated, service_role;

comment on function public.report_monthly_prepared_meat_stock(integer) is
  'Returns cumulative prepared-meat package balances and monthly net movement by Hong Kong month. Runs as invoker so source-table RLS applies.';
