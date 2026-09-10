-- Same order + ingredient + delivery time often has one consumption row per
-- order line. The ledger only shows order_number + calculation_source, so those
-- rows look duplicated. Aggregate them for display while keeping line-level
-- storage for reconciles.
create or replace function public.material_inventory_ledger(
  p_kind text,
  p_ingredient_id uuid
)
returns table (
  movement_id text, movement_type text, occurred_at timestamptz,
  quantity numeric, balance_after numeric, reference text, note text,
  is_reversal boolean
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.has_page_access('kitchen.inventory') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return query
  with events (
    movement_id, movement_type, occurred_at, quantity, reference, note, is_reversal
  ) as (
    select event.id::text,
      case when event.entry_type = 'correction' then 'adjustment' else 'stocktake' end,
      event.stocktake_at, event.quantity, event.legacy_id, event.correction_reason
      , false
    from public.ingredient_stocktake_events event
    where p_kind = 'ingredient' and event.ingredient_id = p_ingredient_id
      and event.entry_type <> 'automatic_balance'
    union all
    select event.id::text,
      case when event.entry_type = 'correction' then 'adjustment' else 'stocktake' end,
      event.stocktake_at, event.quantity, event.legacy_id, event.correction_reason
      , false
    from public.packing_stocktake_events event
    where p_kind = 'packing' and event.ingredient_id = p_ingredient_id
      and event.entry_type <> 'automatic_balance'
    union all
    select movement.id::text, movement.movement_type, movement.occurred_at,
      case when movement.movement_type = 'inbound'
        then movement.quantity * catalog.stocktake_quantity_per_unit
        else -movement.quantity * catalog.stocktake_quantity_per_unit end,
      movement.source_type || ':' || movement.source_id::text, movement.remarks,
      false
    from public.shop_dry_stock_movements movement
    join public.shop_catalog_items catalog on catalog.id = movement.catalog_item_id
    where catalog.ingredient_id = p_ingredient_id
      and catalog.stocktake_kind = p_kind
    union all
    select
      min(consumption.id::text)
        || case when count(*) > 1 then ':n' || count(*)::text else '' end,
      'consumption',
      consumption.consumed_at,
      -sum(consumption.quantity),
      orders.order_number,
      consumption.calculation_source,
      (consumption.reversed_at is not null)
    from public.order_material_consumptions consumption
    join public.orders orders on orders.id = consumption.order_id
    where consumption.ingredient_id = p_ingredient_id
    group by
      orders.order_number,
      consumption.consumed_at,
      consumption.calculation_source,
      (consumption.reversed_at is not null)
    union all
    select
      min(consumption.id::text) || ':reversal'
        || case when count(*) > 1 then ':n' || count(*)::text else '' end,
      'adjustment',
      consumption.reversed_at,
      sum(consumption.quantity),
      orders.order_number,
      coalesce(consumption.reversal_reason, 'order_recalculated'),
      true
    from public.order_material_consumptions consumption
    join public.orders orders on orders.id = consumption.order_id
    where consumption.ingredient_id = p_ingredient_id
      and consumption.reversed_at is not null
    group by
      orders.order_number,
      consumption.reversed_at,
      coalesce(consumption.reversal_reason, 'order_recalculated')
  )
  select events.movement_id, events.movement_type, events.occurred_at, events.quantity,
    private.material_inventory_current_balance(
      p_kind, p_ingredient_id, events.occurred_at
    ), events.reference, events.note, events.is_reversal
  from events
  order by events.occurred_at desc nulls last, events.movement_id desc
  limit 500;
end;
$$;
