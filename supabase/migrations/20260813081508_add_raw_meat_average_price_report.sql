create function public.report_monthly_raw_meat_average_prices(
  report_year integer
)
returns table (
  raw_meat_item_id uuid,
  raw_meat_name text,
  sort_order numeric,
  month_number integer,
  average_price_per_kg numeric,
  total_quantity_kg numeric,
  receipt_count bigint
)
language sql
stable
set search_path = ''
as $$
  select
    item.id as raw_meat_item_id,
    item.name as raw_meat_name,
    item.sort_order,
    extract(
      month from movement.movement_at at time zone 'Asia/Hong_Kong'
    )::integer as month_number,
    sum(
      coalesce(
        movement.inbound_total_amount,
        movement.inbound_unit_price * movement.inbound_quantity_kg
      )
    ) / nullif(sum(movement.inbound_quantity_kg), 0) as average_price_per_kg,
    sum(movement.inbound_quantity_kg) as total_quantity_kg,
    count(*) as receipt_count
  from public.raw_meat_stock_movements as movement
  join public.raw_meat_items as item
    on item.id = movement.raw_meat_item_id
  where movement.movement_at is not null
    and movement.inbound_quantity_kg > 0
    and movement.inbound_unit_price is not null
    and extract(
      year from movement.movement_at at time zone 'Asia/Hong_Kong'
    )::integer = report_year
    and item.archived_at is null
    and item.is_active
  group by
    item.id,
    item.name,
    item.sort_order,
    extract(
      month from movement.movement_at at time zone 'Asia/Hong_Kong'
    )
  order by item.sort_order nulls last, item.name, month_number;
$$;

revoke all on function public.report_monthly_raw_meat_average_prices(integer)
from public, anon;
grant execute on function public.report_monthly_raw_meat_average_prices(integer)
to authenticated, service_role;

comment on function public.report_monthly_raw_meat_average_prices(integer) is
  'Returns quantity-weighted raw-meat receipt prices per KG by Hong Kong business month. Runs as invoker so source-table RLS applies.';
