-- A physical stocktake is an absolute balance baseline. When an order
-- consumption happened before that baseline, a later reversal must not add
-- the quantity again because the stocktake already superseded the deduction.
begin;

create or replace function private.material_inventory_current_balance(
  p_kind text,
  p_ingredient_id uuid,
  p_as_of timestamptz default now()
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_baseline numeric;
  v_baseline_at timestamptz;
  v_movement_delta numeric := 0;
  v_consumption numeric := 0;
begin
  if p_kind = 'ingredient' then
    select event.quantity, event.stocktake_at into v_baseline, v_baseline_at
    from public.ingredient_stocktake_events event
    where event.ingredient_id = p_ingredient_id and event.stocktake_at <= p_as_of
    order by event.stocktake_at desc nulls last, event.created_at desc, event.id desc
    limit 1;
  elsif p_kind = 'packing' then
    select event.quantity, event.stocktake_at into v_baseline, v_baseline_at
    from public.packing_stocktake_events event
    where event.ingredient_id = p_ingredient_id and event.stocktake_at <= p_as_of
    order by event.stocktake_at desc nulls last, event.created_at desc, event.id desc
    limit 1;
  else
    raise exception 'stocktake_kind_invalid' using errcode = '22023';
  end if;
  if v_baseline is null then return null; end if;

  select coalesce(sum(
    case when movement.movement_type = 'inbound' then movement.quantity
      else -movement.quantity end * catalog.stocktake_quantity_per_unit
  ), 0) into v_movement_delta
  from public.shop_dry_stock_movements movement
  join public.shop_catalog_items catalog on catalog.id = movement.catalog_item_id
  where catalog.ingredient_id = p_ingredient_id
    and catalog.stocktake_kind = p_kind
    and movement.occurred_at > v_baseline_at
    and movement.occurred_at <= p_as_of;

  select coalesce(sum(
    case when consumption.consumed_at > v_baseline_at
      and consumption.consumed_at <= p_as_of then consumption.quantity else 0 end
    - case when consumption.consumed_at > v_baseline_at
      and consumption.reversed_at is not null
      and greatest(consumption.reversed_at, consumption.consumed_at) > v_baseline_at
      and greatest(consumption.reversed_at, consumption.consumed_at) <= p_as_of
      then consumption.quantity else 0 end
  ), 0) into v_consumption
  from public.order_material_consumptions consumption
  where consumption.ingredient_id = p_ingredient_id;

  return v_baseline + v_movement_delta - v_consumption;
end;
$$;

commit;
