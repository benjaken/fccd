-- One demand interface feeds the material-usage screen, the 14-day forecast,
-- per-order shortage allocation, and delivery commitment calculations.

create or replace function private.catering_line_material_is_unmapped(
  p_order_line_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1 from public.order_lines line
    where line.id = p_order_line_id and line.is_void is false
      and (line.product_id is not null or line.package_id is not null)
      and (
        not exists (select 1 from private.catering_line_material_requirements(line.id))
        or (
          line.package_id is not null
          -- Material snapshots do not identify which selected product they cover.
          -- Keep missing-product warnings even when packaging or another item maps.
          and exists (
            select 1 from (
              select package_product.product_id
              from public.order_package_choice_snapshots choice
              left join public.package_products package_product on package_product.id = choice.package_product_id
              where choice.order_line_id = line.id and choice.is_selected
                and coalesce(package_product.package_id, choice.package_id) = line.package_id
              union all
              select package_product.product_id from public.package_products package_product
              where package_product.package_id = line.package_id and package_product.is_selected
                and not exists (select 1 from public.order_package_choice_snapshots choice
                  left join public.package_products chosen on chosen.id = choice.package_product_id
                  where choice.order_line_id = line.id
                    and coalesce(chosen.package_id, choice.package_id) = line.package_id)
            ) selected_product
            where not exists (select 1 from public.product_ingredients recipe
              where recipe.product_id = selected_product.product_id and recipe.ingredient_id is not null
                and coalesce(recipe.quantity, recipe.test_quantity, 0) > 0)
          )
        )
      )
  );
$$;

-- Shared pending delivery slices also drive missing-BOM warnings.
create or replace function private.catering_pending_delivery_slices(p_start_date date, p_days integer)
returns table (source_line_id uuid, source_order_id uuid, product_id uuid, line_quantity numeric,
  delivery_id uuid, service_at timestamptz, source_quantity numeric)
language sql stable security definer set search_path = public, private, pg_temp as $$
  with bounds as (
    select
      p_start_date::timestamp at time zone 'Asia/Hong_Kong' as starts_at,
      (p_start_date + greatest(1, least(coalesce(p_days, 14), 31)))::timestamp
        at time zone 'Asia/Hong_Kong' as ends_at
  ), live_catering_lines as (
    select line.*, orders.order_number,
      coalesce(line.delivery_at, orders.delivery_at) as fallback_service_at
    from public.order_lines line
    join public.orders orders on orders.id = line.order_id
    where orders.document_type = 'order'
      and orders.archived_at is null
      and orders.merged_into_order_id is null
      and coalesce(orders.delivery_status, '') not in
        ('已取消', '取消', 'Cancelled', 'cancelled')
      and line.is_void is false
      and not exists (
        select 1 from public.order_list_manual_todos todo
        where todo.order_id = orders.id and todo.todo_key = 'cancelled'
      )
  ), catering_slices as (
    select line.id as source_line_id, line.order_id as source_order_id,
      line.product_id, line.quantity as line_quantity,
      allocation.delivery_id, delivery.delivery_at as service_at,
      allocation.allocated_quantity as source_quantity
    from live_catering_lines line
    join public.order_line_delivery_allocations allocation
      on allocation.order_line_id = line.id
    join public.deliveries delivery on delivery.id = allocation.delivery_id
    cross join bounds
    where not private.delivery_material_is_committed(delivery.delivery_status)
      and coalesce(delivery.delivery_status, '') not in
        ('已取消', '取消', 'Cancelled', 'cancelled')
      and delivery.delivery_at >= bounds.starts_at
      and delivery.delivery_at < bounds.ends_at

    union all

    select line.id, line.order_id, line.product_id, line.quantity,
      null::uuid, line.fallback_service_at, line.quantity
    from live_catering_lines line
    cross join bounds
    where not exists (
        select 1 from public.order_line_delivery_allocations allocation
        where allocation.order_line_id = line.id
      )
      and not exists (
        select 1 from public.order_material_consumptions consumption
        where consumption.order_line_id = line.id
          and consumption.reversed_at is null
      )
      and line.fallback_service_at >= bounds.starts_at
      and line.fallback_service_at < bounds.ends_at

  ) select * from catering_slices;
$$;
revoke all on function private.catering_pending_delivery_slices(date, integer) from public, anon, authenticated;

create or replace function private.inventory_demand_lines(
  p_start_date date,
  p_days integer
)
returns table (
  demand_source text,
  source_order_id uuid,
  source_line_id uuid,
  delivery_id uuid,
  service_at timestamptz,
  source_type text,
  item_id uuid,
  sku text,
  item_name text,
  unit text,
  warehouse text,
  required_stock numeric,
  source_quantity numeric,
  calculation_source text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  with catering_slices as (
    select * from private.catering_pending_delivery_slices(p_start_date, p_days)
  ), catering_demand as (
    select 'catering'::text as demand_source,
      slice.source_order_id, slice.source_line_id, slice.delivery_id,
      slice.service_at, 'ingredient'::text as source_type,
      requirement.ingredient_id as item_id, ingredient.sku,
      ingredient.name as item_name, ingredient.stocktake_unit as unit,
      case when ingredient.is_packing_stocktake then 'packing'
        else 'ingredient' end as warehouse,
      requirement.required_quantity as required_stock,
      slice.source_quantity, requirement.calculation_source
    from catering_slices slice
    cross join lateral (
      select material.ingredient_id, material.required_quantity, material.calculation_source
      from private.catering_delivery_material_requirements(slice.source_line_id) material
      where slice.delivery_id is not null and material.delivery_id = slice.delivery_id
      union all
      select material.ingredient_id, round(material.required_quantity, 3), material.calculation_source
      from private.catering_line_material_requirements(slice.source_line_id) material
      where slice.delivery_id is null
    ) requirement
    join public.ingredients ingredient on ingredient.id = requirement.ingredient_id
    where requirement.required_quantity > 0
  ), restaurant_demand as (
    select 'restaurant'::text, request.id, line.id, null::uuid,
      request.delivery_date::timestamp at time zone 'Asia/Hong_Kong',
      case when catalog.ingredient_id is null then 'catalog' else 'ingredient' end,
      coalesce(catalog.ingredient_id, catalog.id),
      coalesce(catalog.sku, line.sku), coalesce(catalog.name, line.name),
      case when catalog.ingredient_id is null then catalog.unit
        else ingredient.stocktake_unit end,
      coalesce(catalog.stocktake_kind, catalog.warehouse),
      line.quantity * case when catalog.ingredient_id is null then 1
        else catalog.stocktake_quantity_per_unit end,
      line.quantity, 'restaurant_order'::text
    from public.shop_order_lines line
    join public.shop_order_requests request on request.id = line.request_id
    join public.shop_catalog_items catalog on catalog.id = line.catalog_item_id
    left join public.ingredients ingredient on ingredient.id = catalog.ingredient_id
    where request.channel = 'fc_internal'
      and request.status in ('submitted', 'reviewed', 'sent_to_factory')
      and request.delivery_date >= p_start_date
      and request.delivery_date < p_start_date
        + greatest(1, least(coalesce(p_days, 14), 31))
      and line.quantity > 0
  )
  select * from catering_demand
  union all
  select * from restaurant_demand;
$$;

create or replace function public.material_usage_forecast_lines(
  p_kind text,
  p_start_date date,
  p_end_date date
)
returns table (
  id text,
  ingredient_id uuid,
  product_id uuid,
  order_id uuid,
  delivery_at timestamptz,
  calculated_quantity numeric,
  ingredient_quantity numeric,
  product_quantity numeric,
  product_name text,
  product_sku text,
  order_number text,
  demand_source text
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if p_kind not in ('ingredient', 'packing') then
    raise exception 'stocktake_kind_invalid' using errcode = '22023';
  end if;
  if not private.has_page_access('kitchen.material_usage')
    and not private.has_page_access('kitchen.inventory') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return query
  select demand.demand_source || ':' || demand.source_line_id::text
      || ':' || coalesce(demand.delivery_id::text, 'unallocated'),
    demand.item_id,
    case when demand.demand_source = 'catering' then line.product_id else null end,
    demand.source_order_id, demand.service_at, demand.required_stock,
    null::numeric, demand.source_quantity,
    case when demand.demand_source = 'catering'
      then coalesce(product.name, line.product_name_snapshot, line.content_snapshot)
      else demand.item_name end,
    case when demand.demand_source = 'catering'
      then coalesce(product.sku, line.sku_snapshot)
      else demand.sku end,
    case when demand.demand_source = 'catering'
      then orders.order_number else request.request_no end,
    demand.demand_source
  from generate_series(0, coalesce(p_end_date, p_start_date) - p_start_date, 31) chunk(day_offset)
  cross join lateral private.inventory_demand_lines(
    p_start_date + chunk.day_offset,
    least(31, coalesce(p_end_date, p_start_date) - p_start_date - chunk.day_offset + 1)
  ) demand
  join public.ingredients ingredient on ingredient.id = demand.item_id
  left join public.order_lines line
    on demand.demand_source = 'catering' and line.id = demand.source_line_id
  left join public.products product on product.id = line.product_id
  left join public.orders orders
    on demand.demand_source = 'catering' and orders.id = demand.source_order_id
  left join public.shop_order_requests request
    on demand.demand_source = 'restaurant' and request.id = demand.source_order_id
  where demand.source_type = 'ingredient'
    and case when p_kind = 'packing' then ingredient.is_packing_stocktake
      else ingredient.is_ingredient_stocktake end
  order by demand.service_at, demand.source_order_id, demand.source_line_id;
end;
$$;

create or replace function public.inventory_forecast_shortages(
  p_start_date date default (timezone('Asia/Hong_Kong', now()))::date,
  p_days integer default 14
)
returns table (
  source_type text,
  item_id uuid,
  sku text,
  item_name text,
  unit text,
  warehouse text,
  current_stock numeric,
  required_stock numeric,
  projected_stock numeric,
  shortage_quantity numeric,
  stock_status text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  with demand as (
    select line.source_type, line.item_id,
      max(line.sku) as sku, max(line.item_name) as item_name,
      max(line.unit) as unit, max(line.warehouse) as warehouse,
      sum(line.required_stock)::numeric as required_stock
    from private.inventory_demand_lines(p_start_date, p_days) line
    group by line.source_type, line.item_id
  ), assessed as (
    select demand.*, public.inventory_item_balance(
      demand.source_type, demand.item_id
    ) as balance
    from demand
  )
  select assessed.source_type, assessed.item_id, assessed.sku,
    assessed.item_name, assessed.unit, assessed.warehouse,
    (assessed.balance ->> 'balance')::numeric,
    assessed.required_stock,
    (assessed.balance ->> 'balance')::numeric - assessed.required_stock,
    case when (assessed.balance ->> 'balance') is null
      then assessed.required_stock
      else greatest(
        assessed.required_stock - (assessed.balance ->> 'balance')::numeric, 0
      ) end,
    case
      when coalesce((assessed.balance ->> 'mapped')::boolean, false) is false
        then 'unmapped'
      when coalesce((assessed.balance ->> 'hasLedger')::boolean, false) is false
        then 'missing'
      when (assessed.balance ->> 'balance')::numeric < assessed.required_stock
        then 'shortage'
      else 'ok'
    end
  from assessed
  where (assessed.balance ->> 'balance') is null
     or (assessed.balance ->> 'balance')::numeric < assessed.required_stock
  order by assessed.warehouse, assessed.item_name;
$$;

create or replace function public.inventory_forecast_unmapped_order_lines(
  p_start_date date default (timezone('Asia/Hong_Kong', now()))::date,
  p_days integer default 14
)
returns table (order_number text, item_name text, delivery_date date)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select distinct orders.order_number,
    coalesce(nullif(line.product_name_snapshot, ''), nullif(line.content_snapshot, ''), '未命名項目'),
    (slice.service_at at time zone 'Asia/Hong_Kong')::date
  from private.catering_pending_delivery_slices(p_start_date, p_days) slice
  join public.order_lines line on line.id = slice.source_line_id
  join public.orders orders on orders.id = slice.source_order_id
  where private.catering_line_material_is_unmapped(line.id)
  order by 3, 1, 2;
$$;

create or replace function public.inventory_forecast_order_shortages(
  p_start_date date default (timezone('Asia/Hong_Kong', now()))::date,
  p_days integer default 14
)
returns table (
  order_id uuid,
  shortage_items jsonb,
  unmapped_line_count bigint
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  with demand_by_order as (
    select demand.demand_source, demand.source_order_id,
      demand.item_id, demand.service_at,
      sum(demand.required_stock)::numeric as required_stock
    from private.inventory_demand_lines(p_start_date, p_days) demand
    where demand.source_type = 'ingredient'
    group by demand.demand_source, demand.source_order_id, demand.item_id, demand.service_at
  ), allocated as (
    select demand.*,
      sum(demand.required_stock) over (
        partition by demand.item_id
        -- Restaurant requests only store a date: reserve them first at
        -- midnight so a same-time catering delivery cannot hide a shortage.
        order by demand.service_at,
          case when demand.demand_source = 'restaurant' then 0 else 1 end,
          demand.source_order_id
        rows between unbounded preceding and current row
      )::numeric as cumulative_required
    from demand_by_order demand
  ), shortages as (
    select * from public.inventory_forecast_shortages(p_start_date, p_days)
    where source_type = 'ingredient'
  ), shortage_by_order as (
    select demand.source_order_id as order_id,
      jsonb_agg(jsonb_build_object(
        'itemId', shortage.item_id,
        'sku', shortage.sku,
        'name', shortage.item_name,
        'unit', shortage.unit,
        'warehouse', shortage.warehouse,
        'orderRequired', demand.required_stock,
        'totalRequired', shortage.required_stock,
        'currentStock', shortage.current_stock,
        'shortageQuantity', case when shortage.current_stock is null
          then demand.required_stock
          else greatest(demand.cumulative_required - shortage.current_stock, 0)
        end,
        'stockStatus', shortage.stock_status
      ) order by shortage.warehouse, shortage.item_name) as shortage_items
    from allocated demand
    join shortages shortage on shortage.item_id = demand.item_id
    where demand.demand_source = 'catering'
      and (shortage.current_stock is null
        or demand.cumulative_required > shortage.current_stock)
    group by demand.source_order_id
  ), unmapped_by_order as (
    select slice.source_order_id as order_id,
      count(distinct slice.source_line_id)::bigint as unmapped_line_count
    from private.catering_pending_delivery_slices(p_start_date, p_days) slice
    where private.catering_line_material_is_unmapped(slice.source_line_id)
    group by slice.source_order_id
  ), affected as (
    select shortage.order_id from shortage_by_order shortage
    union
    select unmapped.order_id from unmapped_by_order unmapped
  )
  select affected.order_id,
    coalesce(shortage.shortage_items, '[]'::jsonb),
    coalesce(unmapped.unmapped_line_count, 0)
  from affected
  left join shortage_by_order shortage on shortage.order_id = affected.order_id
  left join unmapped_by_order unmapped on unmapped.order_id = affected.order_id;
$$;

-- Reversals remain visible in the ledger and affect balances only from the
-- reversal timestamp onwards.
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
    - case when consumption.reversed_at > v_baseline_at
      and consumption.reversed_at <= p_as_of then consumption.quantity else 0 end
  ), 0) into v_consumption
  from public.order_material_consumptions consumption
  where consumption.ingredient_id = p_ingredient_id;

  return v_baseline + v_movement_delta - v_consumption;
end;
$$;

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
    select consumption.id::text, 'consumption', consumption.consumed_at,
      -consumption.quantity, orders.order_number, consumption.calculation_source,
      false
    from public.order_material_consumptions consumption
    join public.orders orders on orders.id = consumption.order_id
    where consumption.ingredient_id = p_ingredient_id
    union all
    select consumption.id::text || ':reversal', 'adjustment',
      consumption.reversed_at, consumption.quantity, orders.order_number,
      coalesce(consumption.reversal_reason, 'order_recalculated'),
      true
    from public.order_material_consumptions consumption
    join public.orders orders on orders.id = consumption.order_id
    where consumption.ingredient_id = p_ingredient_id
      and consumption.reversed_at is not null
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

revoke all on function private.catering_line_material_is_unmapped(uuid)
  from public, anon, authenticated;
revoke all on function private.inventory_demand_lines(date, integer)
  from public, anon, authenticated;
revoke all on function public.material_usage_forecast_lines(text, date, date)
  from public, anon;
grant execute on function public.material_usage_forecast_lines(text, date, date)
  to authenticated;
revoke all on function public.inventory_forecast_shortages(date, integer)
  from public, anon, authenticated;
grant execute on function public.inventory_forecast_shortages(date, integer)
  to service_role;
revoke all on function public.inventory_forecast_unmapped_order_lines(date, integer)
  from public, anon, authenticated;
grant execute on function public.inventory_forecast_unmapped_order_lines(date, integer)
  to service_role;
revoke all on function public.inventory_forecast_order_shortages(date, integer)
  from public, anon, authenticated;
grant execute on function public.inventory_forecast_order_shortages(date, integer)
  to service_role;

comment on function private.inventory_demand_lines(date, integer) is
  'Canonical chronological demand stream for catering and restaurant replenishment.';
comment on function public.material_usage_forecast_lines(text, date, date) is
  'Material-usage adapter over the canonical inventory demand stream.';
