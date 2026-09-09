-- Unified ingredient / packaging inventory ledger.
-- Catering material consumption is recorded only after every active delivery
-- for a formal order has actually been fulfilled.

alter table public.ingredient_stocktake_events
  add column if not exists entry_type text not null default 'stocktake',
  add column if not exists correction_reason text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.packing_stocktake_events
  add column if not exists entry_type text not null default 'stocktake',
  add column if not exists correction_reason text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.ingredient_stocktake_events
  drop constraint if exists ingredient_stocktake_events_entry_type_check,
  add constraint ingredient_stocktake_events_entry_type_check
    check (entry_type in ('stocktake', 'correction', 'automatic_balance'));

alter table public.packing_stocktake_events
  drop constraint if exists packing_stocktake_events_entry_type_check,
  add constraint packing_stocktake_events_entry_type_check
    check (entry_type in ('stocktake', 'correction', 'automatic_balance'));

update public.ingredient_stocktake_events
set entry_type = 'automatic_balance'
where legacy_id like 'shop-auto-%';

update public.packing_stocktake_events
set entry_type = 'automatic_balance'
where legacy_id like 'shop-auto-%';

create table if not exists public.order_material_consumptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  delivery_id uuid not null references public.deliveries(id),
  order_line_id uuid not null references public.order_lines(id),
  ingredient_id uuid not null references public.ingredients(id),
  quantity numeric(14, 3) not null check (quantity > 0),
  consumed_at timestamptz not null,
  calculation_source text not null
    check (calculation_source in ('order_bom', 'product_bom', 'package_bom')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (order_line_id, ingredient_id)
);

create index if not exists order_material_consumptions_ingredient_time_idx
  on public.order_material_consumptions (ingredient_id, consumed_at desc);
create index if not exists order_material_consumptions_order_idx
  on public.order_material_consumptions (order_id);

alter table public.order_material_consumptions enable row level security;
revoke all on public.order_material_consumptions from public, anon, authenticated;
grant all on public.order_material_consumptions to service_role;

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
    select event.quantity, event.stocktake_at
    into v_baseline, v_baseline_at
    from public.ingredient_stocktake_events event
    where event.ingredient_id = p_ingredient_id
      and event.stocktake_at <= p_as_of
    order by event.stocktake_at desc nulls last, event.created_at desc, event.id desc
    limit 1;
  elsif p_kind = 'packing' then
    select event.quantity, event.stocktake_at
    into v_baseline, v_baseline_at
    from public.packing_stocktake_events event
    where event.ingredient_id = p_ingredient_id
      and event.stocktake_at <= p_as_of
    order by event.stocktake_at desc nulls last, event.created_at desc, event.id desc
    limit 1;
  else
    raise exception 'stocktake_kind_invalid' using errcode = '22023';
  end if;

  if v_baseline is null then return null; end if;

  select coalesce(sum(
    case when movement.movement_type = 'inbound' then movement.quantity
      else -movement.quantity end * catalog.stocktake_quantity_per_unit
  ), 0)
  into v_movement_delta
  from public.shop_dry_stock_movements movement
  join public.shop_catalog_items catalog on catalog.id = movement.catalog_item_id
  where catalog.ingredient_id = p_ingredient_id
    and catalog.stocktake_kind = p_kind
    and movement.occurred_at > v_baseline_at
    and movement.occurred_at <= p_as_of;

  select coalesce(sum(consumption.quantity), 0)
  into v_consumption
  from public.order_material_consumptions consumption
  where consumption.ingredient_id = p_ingredient_id
    and consumption.consumed_at > v_baseline_at
    and consumption.consumed_at <= p_as_of;

  return v_baseline + v_movement_delta - v_consumption;
end;
$$;

-- Keep automatic warehouse snapshots aligned with delivered-order consumption
-- instead of rebuilding them from warehouse movements alone.
create or replace function public.shop_sync_material_stocktake()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_catalog public.shop_catalog_items%rowtype;
  v_ingredient public.ingredients%rowtype;
  v_balance numeric;
  v_legacy_id text;
begin
  if new.catalog_item_id is null then return new; end if;
  perform public.shop_ensure_catalog_ingredient(new.catalog_item_id);
  select * into v_catalog from public.shop_catalog_items where id = new.catalog_item_id;
  if v_catalog.channel <> 'fc_internal' or v_catalog.stocktake_kind is null
    or v_catalog.ingredient_id is null then return new; end if;
  select * into v_ingredient from public.ingredients where id = v_catalog.ingredient_id;

  v_balance := private.material_inventory_current_balance(
    v_catalog.stocktake_kind, v_catalog.ingredient_id, new.occurred_at
  );
  if v_balance is null then
    select coalesce(sum(
      case when movement.movement_type = 'inbound' then movement.quantity else -movement.quantity end
      * catalog.stocktake_quantity_per_unit
    ), 0)
    into v_balance
    from public.shop_dry_stock_movements movement
    join public.shop_catalog_items catalog on catalog.id = movement.catalog_item_id
    where catalog.ingredient_id = v_catalog.ingredient_id
      and catalog.stocktake_kind = v_catalog.stocktake_kind
      and movement.occurred_at <= new.occurred_at;
  end if;

  v_legacy_id := 'shop-auto-' || v_catalog.stocktake_kind || '-stocktake:'
    || new.source_type || ':' || new.source_id::text;
  if v_catalog.stocktake_kind = 'ingredient' then
    insert into public.ingredient_stocktake_events (
      legacy_id, ingredient_id, ingredient_legacy_id, stocktake_at, quantity,
      sku_snapshot, bubble_created_at, bubble_modified_at, entry_type
    ) values (
      v_legacy_id, v_ingredient.id, v_ingredient.legacy_id, new.occurred_at,
      v_balance, coalesce(new.sku, v_ingredient.sku), new.occurred_at,
      new.occurred_at, 'automatic_balance'
    ) on conflict (legacy_id) do nothing;
  else
    insert into public.packing_stocktake_events (
      legacy_id, ingredient_id, ingredient_legacy_id, stocktake_at, quantity,
      sku_snapshot, bubble_created_at, bubble_modified_at, entry_type
    ) values (
      v_legacy_id, v_ingredient.id, v_ingredient.legacy_id, new.occurred_at,
      v_balance, coalesce(new.sku, v_ingredient.sku), new.occurred_at,
      new.occurred_at, 'automatic_balance'
    ) on conflict (legacy_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.record_delivered_order_material_consumption(
  p_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_consumed_at timestamptz;
  v_inserted integer := 0;
begin
  if not exists (
    select 1 from public.orders orders
    where orders.id = p_order_id
      and orders.document_type = 'order'
      and orders.archived_at is null
      and orders.merged_into_order_id is null
      and orders.delivery_status in ('已送達', '己送達')
  ) then return 0; end if;

  if exists (
    select 1 from public.deliveries delivery
    where delivery.order_id = p_order_id
      and coalesce(delivery.delivery_status, '') not in ('已取消', '取消', 'Cancelled')
      and delivery.fulfilled_at is null
  ) then return 0; end if;

  select max(delivery.fulfilled_at) into v_consumed_at
  from public.deliveries delivery
  where delivery.order_id = p_order_id
    and coalesce(delivery.delivery_status, '') not in ('已取消', '取消', 'Cancelled')
    and delivery.fulfilled_at is not null;
  if v_consumed_at is null then return 0; end if;

  with live_lines as (
    select line.*
    from public.order_lines line
    where line.order_id = p_order_id and line.is_void is false
  ), snapshot_demand as (
    select line.id as order_line_id, requirement.ingredient_id,
      sum(coalesce(requirement.calculated_quantity, requirement.ingredient_quantity, 0))::numeric as quantity,
      'order_bom'::text as calculation_source
    from live_lines line
    join public.order_bom_requirements requirement on requirement.order_line_id = line.id
    where requirement.ingredient_id is not null
    group by line.id, requirement.ingredient_id
  ), direct_product_demand as (
    select line.id as order_line_id, recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0) * coalesce(line.quantity, 0))::numeric as quantity,
      'product_bom'::text as calculation_source
    from live_lines line
    join public.product_ingredients recipe on recipe.product_id = line.product_id
    where line.product_id is not null
      and not exists (select 1 from public.order_bom_requirements requirement where requirement.order_line_id = line.id)
      and recipe.ingredient_id is not null
    group by line.id, recipe.ingredient_id
  ), package_base_demand as (
    select line.id as order_line_id, recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0) * coalesce(line.quantity, 0))::numeric as quantity,
      'package_bom'::text as calculation_source
    from live_lines line
    join public.product_ingredients recipe on recipe.package_id = line.package_id
    where line.package_id is not null
      and not exists (select 1 from public.order_bom_requirements requirement where requirement.order_line_id = line.id)
      and recipe.ingredient_id is not null
    group by line.id, recipe.ingredient_id
  ), selected_product_demand as (
    select line.id as order_line_id, recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(package_product.quantity, 1) * coalesce(line.quantity, 0))::numeric as quantity,
      'package_bom'::text as calculation_source
    from live_lines line
    join public.order_package_choice_snapshots choice on choice.order_line_id = line.id and choice.is_selected
    join public.package_products package_product on package_product.id = choice.package_product_id
    join public.product_ingredients recipe on recipe.product_id = package_product.product_id
    where line.package_id is not null
      and not exists (select 1 from public.order_bom_requirements requirement where requirement.order_line_id = line.id)
      and recipe.ingredient_id is not null
    group by line.id, recipe.ingredient_id
  ), default_product_demand as (
    select line.id as order_line_id, recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(package_product.quantity, 1) * coalesce(line.quantity, 0))::numeric as quantity,
      'package_bom'::text as calculation_source
    from live_lines line
    join public.package_products package_product on package_product.package_id = line.package_id and package_product.is_selected
    join public.product_ingredients recipe on recipe.product_id = package_product.product_id
    where line.package_id is not null
      and not exists (select 1 from public.order_bom_requirements requirement where requirement.order_line_id = line.id)
      and not exists (select 1 from public.order_package_choice_snapshots choice where choice.order_line_id = line.id)
      and recipe.ingredient_id is not null
    group by line.id, recipe.ingredient_id
  ), combined as (
    select * from snapshot_demand
    union all select * from direct_product_demand
    union all select * from package_base_demand
    union all select * from selected_product_demand
    union all select * from default_product_demand
  ), demand as (
    select order_line_id, ingredient_id, sum(quantity)::numeric as quantity,
      case when bool_or(calculation_source = 'order_bom') then 'order_bom'
        when bool_or(calculation_source = 'package_bom') then 'package_bom'
        else 'product_bom' end as calculation_source
    from combined
    group by order_line_id, ingredient_id
  )
  insert into public.order_material_consumptions (
    order_id, order_line_id, ingredient_id, quantity, consumed_at,
    calculation_source, metadata
  )
  select p_order_id, demand.order_line_id, demand.ingredient_id,
    demand.quantity, v_consumed_at, demand.calculation_source,
    jsonb_build_object('deliveryCompleted', true)
  from demand
  where demand.quantity > 0
  on conflict (order_line_id, ingredient_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function private.consume_materials_when_order_delivered()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.delivery_status in ('已送達', '己送達')
    and old.delivery_status is distinct from new.delivery_status then
    perform private.record_delivered_order_material_consumption(new.id);
  end if;
  return new;
end;
$$;

create or replace function private.consume_materials_when_delivery_fulfilled()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.order_id is not null
    and (old.fulfilled_at is distinct from new.fulfilled_at
      or old.delivery_status is distinct from new.delivery_status) then
    perform private.record_delivered_order_material_consumption(new.order_id);
  end if;
  return new;
end;
$$;

drop trigger if exists consume_materials_when_order_delivered on public.orders;
create trigger consume_materials_when_order_delivered
after update of delivery_status on public.orders
for each row execute function private.consume_materials_when_order_delivered();

drop trigger if exists consume_materials_when_delivery_fulfilled on public.deliveries;
create trigger consume_materials_when_delivery_fulfilled
after update of fulfilled_at, delivery_status on public.deliveries
for each row execute function private.consume_materials_when_delivery_fulfilled();

create or replace function public.get_material_current_stock(
  p_kind text,
  p_ingredient_ids uuid[]
)
returns table (ingredient_id uuid, quantity numeric, stocktake_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if p_kind not in ('ingredient', 'packing') then raise exception 'stocktake_kind_invalid'; end if;
  if not private.has_page_access('kitchen.inventory')
    and not private.has_page_access('kitchen.material_usage')
    and not private.has_page_access(case when p_kind = 'ingredient' then 'kitchen.ingredient_stocktakes' else 'kitchen.packing_stocktakes' end)
  then raise exception 'page_access_required' using errcode = '42501'; end if;

  return query
  select ingredient.id,
    private.material_inventory_current_balance(p_kind, ingredient.id, now()),
    case when p_kind = 'ingredient' then (
      select event.stocktake_at from public.ingredient_stocktake_events event
      where event.ingredient_id = ingredient.id order by event.stocktake_at desc nulls last, event.created_at desc limit 1
    ) else (
      select event.stocktake_at from public.packing_stocktake_events event
      where event.ingredient_id = ingredient.id order by event.stocktake_at desc nulls last, event.created_at desc limit 1
    ) end
  from public.ingredients ingredient
  where ingredient.id = any(coalesce(p_ingredient_ids, '{}'::uuid[]));
end;
$$;

create or replace function public.inventory_item_balance(p_source_type text, p_source_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_balance numeric;
  v_kind text;
begin
  if p_source_type = 'catalog' then return public.inventory_catalog_balance(p_source_id); end if;
  if p_source_type <> 'ingredient' then
    return jsonb_build_object('mapped', false, 'hasLedger', false, 'balance', null);
  end if;

  select case when ingredient.is_packing_stocktake then 'packing'
    when ingredient.is_ingredient_stocktake then 'ingredient' else null end
  into v_kind
  from public.ingredients ingredient where ingredient.id = p_source_id;
  if v_kind is null then
    return jsonb_build_object('mapped', false, 'hasLedger', false, 'balance', null);
  end if;

  v_balance := private.material_inventory_current_balance(v_kind, p_source_id, now());
  return jsonb_build_object(
    'mapped', true,
    'hasLedger', v_balance is not null,
    'balance', v_balance
  );
end;
$$;

create or replace function public.material_inventory_summary(
  p_kind text,
  p_search text default null
)
returns table (
  ingredient_id uuid, sku text, item_name text, ingredient_type text,
  unit text, current_quantity numeric, minimum_stock numeric,
  last_activity_at timestamptz
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
  if p_kind not in ('ingredient', 'packing') then raise exception 'stocktake_kind_invalid'; end if;

  return query
  select ingredient.id, ingredient.sku, ingredient.name, ingredient.ingredient_type,
    coalesce(ingredient.stocktake_unit, ingredient.product_unit, ''),
    private.material_inventory_current_balance(p_kind, ingredient.id, now()),
    ingredient.minimum_stock_level,
    greatest(
      case when p_kind = 'ingredient' then (select max(e.stocktake_at) from public.ingredient_stocktake_events e where e.ingredient_id = ingredient.id)
        else (select max(e.stocktake_at) from public.packing_stocktake_events e where e.ingredient_id = ingredient.id) end,
      (select max(m.occurred_at) from public.shop_dry_stock_movements m join public.shop_catalog_items c on c.id = m.catalog_item_id where c.ingredient_id = ingredient.id and c.stocktake_kind = p_kind),
      (select max(cn.consumed_at) from public.order_material_consumptions cn where cn.ingredient_id = ingredient.id)
    )
  from public.ingredients ingredient
  where ingredient.archived_at is null and ingredient.is_active
    and case when p_kind = 'ingredient' then ingredient.is_ingredient_stocktake else ingredient.is_packing_stocktake end
    and (coalesce(btrim(p_search), '') = '' or concat_ws(' ', ingredient.sku, ingredient.name, ingredient.ingredient_type) ilike '%' || btrim(p_search) || '%')
  order by ingredient.name, ingredient.sku;
end;
$$;

create or replace function public.material_inventory_ledger(
  p_kind text,
  p_ingredient_id uuid
)
returns table (
  movement_id text, movement_type text, occurred_at timestamptz,
  quantity numeric, balance_after numeric, reference text, note text
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
  with events as (
    select event.id::text as movement_id,
      case when event.entry_type = 'correction' then 'adjustment' else 'stocktake' end as movement_type,
      event.stocktake_at as occurred_at, event.quantity,
      event.legacy_id as reference, event.correction_reason as note
    from public.ingredient_stocktake_events event
    where p_kind = 'ingredient' and event.ingredient_id = p_ingredient_id
      and event.entry_type <> 'automatic_balance'
    union all
    select event.id::text,
      case when event.entry_type = 'correction' then 'adjustment' else 'stocktake' end,
      event.stocktake_at, event.quantity, event.legacy_id, event.correction_reason
    from public.packing_stocktake_events event
    where p_kind = 'packing' and event.ingredient_id = p_ingredient_id
      and event.entry_type <> 'automatic_balance'
    union all
    select movement.id::text, movement.movement_type, movement.occurred_at,
      case when movement.movement_type = 'inbound' then movement.quantity * catalog.stocktake_quantity_per_unit else -movement.quantity * catalog.stocktake_quantity_per_unit end,
      movement.source_type || ':' || movement.source_id::text, movement.remarks
    from public.shop_dry_stock_movements movement
    join public.shop_catalog_items catalog on catalog.id = movement.catalog_item_id
    where catalog.ingredient_id = p_ingredient_id and catalog.stocktake_kind = p_kind
    union all
    select consumption.id::text, 'consumption', consumption.consumed_at,
      -consumption.quantity, orders.order_number, consumption.calculation_source
    from public.order_material_consumptions consumption
    join public.orders orders on orders.id = consumption.order_id
    where consumption.ingredient_id = p_ingredient_id
  )
  select events.movement_id, events.movement_type, events.occurred_at,
    events.quantity,
    private.material_inventory_current_balance(p_kind, p_ingredient_id, events.occurred_at),
    events.reference, events.note
  from events
  order by events.occurred_at desc nulls last, events.movement_id desc
  limit 500;
end;
$$;

create or replace function public.correct_material_current_stock(
  p_kind text,
  p_ingredient_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_ingredient public.ingredients%rowtype;
begin
  if not private.has_page_manage('kitchen.inventory')
    and not private.has_page_access(case when p_kind = 'ingredient' then 'kitchen.ingredient_stocktakes.edit' else 'kitchen.packing_stocktakes.edit' end)
  then raise exception 'page_manage_required' using errcode = '42501'; end if;
  if p_kind not in ('ingredient', 'packing') then raise exception 'stocktake_kind_invalid'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'quantity_invalid'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  select * into v_ingredient from public.ingredients where id = p_ingredient_id and archived_at is null;
  if not found then raise exception 'ingredient_not_found'; end if;
  if (p_kind = 'ingredient' and not v_ingredient.is_ingredient_stocktake)
    or (p_kind = 'packing' and not v_ingredient.is_packing_stocktake) then
    raise exception 'ingredient_kind_mismatch' using errcode = '22023';
  end if;

  if p_kind = 'ingredient' then
    insert into public.ingredient_stocktake_events (
      id, legacy_id, ingredient_id, ingredient_legacy_id, stocktake_at, quantity,
      sku_snapshot, bubble_created_at, bubble_modified_at, entry_type,
      correction_reason, created_by, updated_at
    ) values (
      v_id, 'inventory-correction:' || v_id::text, v_ingredient.id, v_ingredient.legacy_id,
      now(), p_quantity, v_ingredient.sku, now(), now(), 'correction', btrim(p_reason), auth.uid(), now()
    );
  else
    insert into public.packing_stocktake_events (
      id, legacy_id, ingredient_id, ingredient_legacy_id, stocktake_at, quantity,
      sku_snapshot, bubble_created_at, bubble_modified_at, entry_type,
      correction_reason, created_by, updated_at
    ) values (
      v_id, 'inventory-correction:' || v_id::text, v_ingredient.id, v_ingredient.legacy_id,
      now(), p_quantity, v_ingredient.sku, now(), now(), 'correction', btrim(p_reason), auth.uid(), now()
    );
  end if;
  return v_id;
end;
$$;

revoke all on function private.material_inventory_current_balance(text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.record_delivered_order_material_consumption(uuid) from public, anon, authenticated;
revoke all on function private.consume_materials_when_order_delivered() from public, anon, authenticated;
revoke all on function private.consume_materials_when_delivery_fulfilled() from public, anon, authenticated;
revoke all on function public.material_inventory_summary(text, text) from public, anon;
revoke all on function public.material_inventory_ledger(text, uuid) from public, anon;
revoke all on function public.correct_material_current_stock(text, uuid, numeric, text) from public, anon;
grant execute on function public.material_inventory_summary(text, text) to authenticated;
grant execute on function public.material_inventory_ledger(text, uuid) to authenticated;
grant execute on function public.correct_material_current_stock(text, uuid, numeric, text) to authenticated;

comment on table public.order_material_consumptions is
  'Immutable BOM material deductions created once after an order is fully delivered.';
