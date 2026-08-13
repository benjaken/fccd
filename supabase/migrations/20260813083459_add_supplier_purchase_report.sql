create function public.report_raw_meat_suppliers()
returns table (
  supplier_id uuid,
  supplier_name text
)
language sql
stable
set search_path = ''
as $$
  select
    supplier.id as supplier_id,
    supplier.company_name as supplier_name
  from public.suppliers as supplier
  where supplier.archived_at is null
    and supplier.is_active
    and exists (
      select 1
      from public.raw_meat_stock_movements as movement
      where movement.supplier_id = supplier.id
        and movement.inbound_quantity_kg > 0
    )
  order by supplier.company_name;
$$;

revoke all on function public.report_raw_meat_suppliers()
from public, anon;
grant execute on function public.report_raw_meat_suppliers()
to authenticated, service_role;

create function public.report_supplier_raw_meat_purchases(
  start_date date,
  end_date date,
  supplier_ids uuid[] default null
)
returns table (
  supplier_id uuid,
  supplier_name text,
  raw_meat_item_id uuid,
  raw_meat_name text,
  quantity_kg numeric,
  purchase_amount numeric,
  average_price_per_kg numeric
)
language sql
stable
set search_path = ''
as $$
  select
    supplier.id as supplier_id,
    supplier.company_name as supplier_name,
    item.id as raw_meat_item_id,
    item.name as raw_meat_name,
    sum(movement.inbound_quantity_kg) as quantity_kg,
    sum(
      coalesce(
        movement.inbound_total_amount,
        movement.inbound_quantity_kg * movement.inbound_unit_price
      )
    ) as purchase_amount,
    sum(
      coalesce(
        movement.inbound_total_amount,
        movement.inbound_quantity_kg * movement.inbound_unit_price
      )
    ) / nullif(sum(movement.inbound_quantity_kg), 0)
      as average_price_per_kg
  from public.raw_meat_stock_movements as movement
  join public.suppliers as supplier
    on supplier.id = movement.supplier_id
  join public.raw_meat_items as item
    on item.id = movement.raw_meat_item_id
  where movement.movement_at >=
      (start_date::timestamp at time zone 'Asia/Hong_Kong')
    and movement.movement_at <
      ((end_date + 1)::timestamp at time zone 'Asia/Hong_Kong')
    and movement.inbound_quantity_kg > 0
    and movement.inbound_unit_price is not null
    and (
      supplier_ids is null
      or cardinality(supplier_ids) = 0
      or supplier.id = any(supplier_ids)
    )
    and supplier.archived_at is null
    and supplier.is_active
    and item.archived_at is null
    and item.is_active
  group by
    supplier.id,
    supplier.company_name,
    item.id,
    item.name,
    item.sort_order
  order by supplier.company_name, item.sort_order nulls last, item.name;
$$;

revoke all on function public.report_supplier_raw_meat_purchases(
  date,
  date,
  uuid[]
)
from public, anon;
grant execute on function public.report_supplier_raw_meat_purchases(
  date,
  date,
  uuid[]
)
to authenticated, service_role;

comment on function public.report_supplier_raw_meat_purchases(
  date,
  date,
  uuid[]
) is
  'Aggregates raw-meat receipt quantity, amount, and weighted price by supplier and selected Hong Kong date range. Runs as invoker so source-table RLS applies.';
