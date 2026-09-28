-- Reversing a scheduled future consumption must not increase today's stock.
-- The reversal affects inventory only after the original deduction has become
-- effective; otherwise a delivery-date edit temporarily creates phantom stock.
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
    - case when consumption.reversed_at is not null
      and greatest(consumption.reversed_at, consumption.consumed_at) > v_baseline_at
      and greatest(consumption.reversed_at, consumption.consumed_at) <= p_as_of
      then consumption.quantity else 0 end
  ), 0) into v_consumption
  from public.order_material_consumptions consumption
  where consumption.ingredient_id = p_ingredient_id;

  return v_baseline + v_movement_delta - v_consumption;
end;
$$;

-- The ledger is an inventory-effect view, so show a future consumption's
-- reversal at the time it can actually affect stock. The source row keeps the
-- original reversed_at timestamp for audit purposes.
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
      event.stocktake_at, event.quantity, event.legacy_id, event.correction_reason,
      false
    from public.ingredient_stocktake_events event
    where p_kind = 'ingredient' and event.ingredient_id = p_ingredient_id
      and event.entry_type <> 'automatic_balance'
    union all
    select event.id::text,
      case when event.entry_type = 'correction' then 'adjustment' else 'stocktake' end,
      event.stocktake_at, event.quantity, event.legacy_id, event.correction_reason,
      false
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
      greatest(consumption.reversed_at, consumption.consumed_at),
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
      greatest(consumption.reversed_at, consumption.consumed_at),
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

commit;
