-- Inventory email alerts: a midnight 14-day shortage digest and one email per
-- threshold crossing. pg_cron uses UTC; 16:00 UTC is 00:00 Asia/Hong_Kong.

alter table public.shop_catalog_items
  add column if not exists minimum_stock_level numeric;

alter table public.ingredients
  add column if not exists minimum_stock_level numeric;

alter table public.shop_catalog_items
  drop constraint if exists shop_catalog_items_minimum_stock_level_check,
  add constraint shop_catalog_items_minimum_stock_level_check
    check (minimum_stock_level is null or minimum_stock_level >= 0);

alter table public.ingredients
  drop constraint if exists ingredients_minimum_stock_level_check,
  add constraint ingredients_minimum_stock_level_check
    check (minimum_stock_level is null or minimum_stock_level >= 0);

-- Declared before forecast functions so partially fulfilled delivery lines can
-- be excluded from future demand. The ledger migration adds its functions.
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

create table if not exists public.inventory_email_alert_state (
  source_type text not null check (source_type in ('catalog', 'ingredient')),
  source_id uuid not null,
  below_minimum boolean not null default false,
  crossing_count integer not null default 0,
  current_stock numeric,
  minimum_stock_level numeric,
  last_checked_at timestamptz not null default now(),
  last_triggered_at timestamptz,
  last_recovered_at timestamptz,
  primary key (source_type, source_id)
);

create table if not exists public.inventory_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('daily_forecast', 'minimum_stock')),
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Operational kill switch. It starts disabled because inventory figures must be
-- verified before any shortage-derived email or WhatsApp is allowed to leave.
create table if not exists public.inventory_notification_controls (
  singleton boolean primary key default true check (singleton),
  shortage_notifications_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.inventory_notification_controls (
  singleton, shortage_notifications_enabled
)
values (true, false)
on conflict (singleton) do nothing;

create index if not exists inventory_email_outbox_pending_idx
  on public.inventory_email_outbox (next_attempt_at, created_at)
  where status = 'pending';

alter table public.inventory_email_alert_state enable row level security;
alter table public.inventory_email_outbox enable row level security;
alter table public.inventory_notification_controls enable row level security;
revoke all on public.inventory_email_alert_state from public, anon, authenticated;
revoke all on public.inventory_email_outbox from public, anon, authenticated;
revoke all on public.inventory_notification_controls from public, anon, authenticated;
grant all on public.inventory_email_alert_state to service_role;
grant all on public.inventory_email_outbox to service_role;
grant all on public.inventory_notification_controls to service_role;

create or replace function private.inventory_shortage_notifications_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select control.shortage_notifications_enabled
    from public.inventory_notification_controls control
    where control.singleton
  ), false);
$$;

create or replace function public.get_inventory_shortage_notification_control()
returns table (enabled boolean, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.has_page_access('workspace.factory.warehouse') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return query
  select control.shortage_notifications_enabled, control.updated_at
  from public.inventory_notification_controls control
  where control.singleton;
end;
$$;

create or replace function public.set_inventory_shortage_notifications_enabled(
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.has_page_manage('workspace.factory.warehouse') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;

  insert into public.inventory_notification_controls (
    singleton, shortage_notifications_enabled, updated_at, updated_by
  )
  values (true, coalesce(p_enabled, false), now(), auth.uid())
  on conflict (singleton) do update set
    shortage_notifications_enabled = excluded.shortage_notifications_enabled,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  if not coalesce(p_enabled, false) then
    delete from public.inventory_email_alert_state;
    update public.inventory_email_outbox
    set status = 'skipped', last_error = 'shortage_notifications_disabled',
        updated_at = now()
    where status in ('pending', 'failed');

    update public.order_reconciliation_issues
    set status = 'resolved', resolved_at = now(), last_checked_at = now(),
        metadata = metadata || jsonb_build_object(
          'resolutionReason', 'shortage_notifications_disabled'
        )
    where issue_type = 'insufficient_stock' and status = 'open';

    update public.order_reconciliation_alert_outbox outbox
    set status = 'skipped', last_error = 'shortage_notifications_disabled',
        updated_at = now()
    from public.order_reconciliation_issues issue
    where outbox.issue_id = issue.id
      and issue.issue_type = 'insufficient_stock'
      and outbox.status in ('pending', 'failed');
  else
    perform public.refresh_inventory_minimum_stock_alerts();
  end if;

  return coalesce(p_enabled, false);
end;
$$;

create or replace function public.inventory_catalog_balance(p_catalog_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.shop_catalog_items%rowtype;
  v_kind text;
  v_meat_item_id uuid;
  v_balance numeric;
  v_units_per_catalog_unit numeric;
  v_has_ledger boolean := false;
  v_mapped boolean := false;
begin
  select * into v_item from public.shop_catalog_items where id = p_catalog_item_id;
  if not found or v_item.channel <> 'fc_internal' or v_item.warehouse is null then
    return jsonb_build_object('mapped', false, 'hasLedger', false, 'balance', null);
  end if;

  if v_item.warehouse = 'dry' then
    v_mapped := true;
    v_has_ledger := exists (
      select 1 from public.shop_dry_stock_movements movement
      where movement.catalog_item_id = v_item.id
    );
    v_balance := public.shop_dry_stock_balance(v_item.id);
  else
    select kind, item_id into v_kind, v_meat_item_id
    from public.shop_lookup_frozen_item(v_item.sku);
    if v_meat_item_id is not null then
      v_mapped := true;
      v_has_ledger := public.shop_frozen_has_ledger(v_kind, v_meat_item_id);
      v_balance := public.shop_frozen_balance(v_kind, v_meat_item_id);
      if v_kind = 'raw' then
        v_units_per_catalog_unit := public.shop_estimate_kg(1, v_item.unit);
        if v_units_per_catalog_unit > 0 then
          v_balance := v_balance / v_units_per_catalog_unit;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'mapped', v_mapped,
    'hasLedger', v_has_ledger,
    'balance', case when v_mapped and v_has_ledger then v_balance else null end
  );
end;
$$;

create or replace function public.inventory_item_balance(p_source_type text, p_source_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance numeric;
begin
  if p_source_type = 'catalog' then
    return public.inventory_catalog_balance(p_source_id);
  end if;
  if p_source_type <> 'ingredient' then
    return jsonb_build_object('mapped', false, 'hasLedger', false, 'balance', null);
  end if;

  select event.quantity into v_balance
  from (
    select stocktake_at, quantity from public.ingredient_stocktake_events where ingredient_id = p_source_id
    union all
    select stocktake_at, quantity from public.packing_stocktake_events where ingredient_id = p_source_id
  ) event
  order by event.stocktake_at desc nulls last
  limit 1;

  return jsonb_build_object(
    'mapped', true,
    'hasLedger', found and v_balance is not null,
    'balance', v_balance
  );
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
set search_path = public, pg_temp
as $$
  with shop_demand as (
    select
      case when item.ingredient_id is not null then 'ingredient' else 'catalog' end as source_type,
      coalesce(item.ingredient_id, item.id) as item_id,
      sum(line.quantity * case when item.ingredient_id is not null
        then item.stocktake_quantity_per_unit else 1 end)::numeric as required_stock
    from public.shop_order_lines line
    join public.shop_order_requests request on request.id = line.request_id
    join public.shop_catalog_items item on item.id = line.catalog_item_id
    where request.channel = 'fc_internal'
      and request.status in ('submitted', 'reviewed', 'sent_to_factory')
      and request.delivery_date >= p_start_date
      and request.delivery_date < p_start_date + greatest(1, least(coalesce(p_days, 14), 31))
      and line.catalog_item_id is not null
    group by case when item.ingredient_id is not null then 'ingredient' else 'catalog' end,
      coalesce(item.ingredient_id, item.id)
  ), live_catering_lines as (
    select catering_line.*, catering_order.order_number,
      coalesce(catering_line.delivery_at, catering_order.delivery_at) as effective_delivery_at
    from public.order_lines catering_line
    join public.orders catering_order on catering_order.id = catering_line.order_id
    where catering_order.document_type = 'order'
      and catering_order.archived_at is null
      and catering_order.merged_into_order_id is null
      and coalesce(catering_line.delivery_at, catering_order.delivery_at) >= (p_start_date::timestamp at time zone 'Asia/Hong_Kong')
      and coalesce(catering_line.delivery_at, catering_order.delivery_at) < ((p_start_date + greatest(1, least(coalesce(p_days, 14), 31)))::timestamp at time zone 'Asia/Hong_Kong')
      and coalesce(catering_order.delivery_status, '') not in ('已取消', '取消', 'Cancelled', 'cancelled')
      and catering_line.is_void is false
      and not exists (
        select 1 from public.order_material_consumptions consumption
        where consumption.order_line_id = catering_line.id
      )
      and not exists (
        select 1 from public.order_list_manual_todos todo
        where todo.order_id = catering_order.id and todo.todo_key = 'cancelled'
      )
  ), catering_snapshot_demand as (
    select
      'ingredient'::text as source_type,
      requirement.ingredient_id as item_id,
      sum(coalesce(requirement.calculated_quantity,
        requirement.ingredient_quantity * coalesce(requirement.product_quantity, catering_line.quantity, 0), 0))::numeric as required_stock
    from public.order_bom_requirements requirement
    join live_catering_lines catering_line on catering_line.id = requirement.order_line_id
    where requirement.ingredient_id is not null
    group by requirement.ingredient_id
  ), catering_direct_product_demand as (
    select 'ingredient'::text as source_type, recipe.ingredient_id as item_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0) * coalesce(line.quantity, 0))::numeric as required_stock
    from live_catering_lines line
    join public.product_ingredients recipe on recipe.product_id = line.product_id
    where line.product_id is not null and not exists (
      select 1 from public.order_bom_requirements requirement where requirement.order_line_id = line.id
    )
      and recipe.ingredient_id is not null
    group by recipe.ingredient_id
  ), catering_package_base_demand as (
    select 'ingredient'::text as source_type, recipe.ingredient_id as item_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0) * coalesce(line.quantity, 0))::numeric as required_stock
    from live_catering_lines line
    join public.product_ingredients recipe on recipe.package_id = line.package_id
    where line.package_id is not null and not exists (
      select 1 from public.order_bom_requirements requirement where requirement.order_line_id = line.id
    )
      and recipe.ingredient_id is not null
    group by recipe.ingredient_id
  ), catering_selected_product_demand as (
    select 'ingredient'::text as source_type, recipe.ingredient_id as item_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0) * coalesce(package_product.quantity, 1) * coalesce(line.quantity, 0))::numeric as required_stock
    from live_catering_lines line
    join public.order_package_choice_snapshots choice
      on choice.order_line_id = line.id and choice.is_selected
    join public.package_products package_product on package_product.id = choice.package_product_id
    join public.product_ingredients recipe on recipe.product_id = package_product.product_id
    where line.package_id is not null and not exists (
      select 1 from public.order_bom_requirements requirement where requirement.order_line_id = line.id
    )
      and recipe.ingredient_id is not null
    group by recipe.ingredient_id
  ), catering_default_package_product_demand as (
    select 'ingredient'::text as source_type, recipe.ingredient_id as item_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0) * coalesce(package_product.quantity, 1) * coalesce(line.quantity, 0))::numeric as required_stock
    from live_catering_lines line
    join public.package_products package_product
      on package_product.package_id = line.package_id and package_product.is_selected
    join public.product_ingredients recipe on recipe.product_id = package_product.product_id
    where line.package_id is not null
      and not exists (select 1 from public.order_bom_requirements requirement where requirement.order_line_id = line.id)
      and not exists (select 1 from public.order_package_choice_snapshots choice where choice.order_line_id = line.id)
      and recipe.ingredient_id is not null
    group by recipe.ingredient_id
  ), demand as (
    select combined.source_type, combined.item_id, sum(combined.required_stock)::numeric as required_stock
    from (
      select * from shop_demand
      union all
      select * from catering_snapshot_demand
      union all
      select * from catering_direct_product_demand
      union all
      select * from catering_package_base_demand
      union all
      select * from catering_selected_product_demand
      union all
      select * from catering_default_package_product_demand
    ) combined
    group by combined.source_type, combined.item_id
  ), assessed as (
    select
      demand.source_type,
      demand.item_id,
      coalesce(ingredient.sku, catalog.sku) as sku,
      coalesce(ingredient.name, catalog.name) as item_name,
      coalesce(ingredient.stocktake_unit, ingredient.product_unit, catalog.unit, '') as unit,
      case
        when demand.source_type = 'ingredient' and ingredient.is_packing_stocktake then 'packing'
        when demand.source_type = 'ingredient' then 'ingredient'
        else catalog.warehouse
      end as warehouse,
      demand.required_stock,
      public.inventory_item_balance(demand.source_type, demand.item_id) as balance
    from demand
    left join public.ingredients ingredient
      on demand.source_type = 'ingredient' and ingredient.id = demand.item_id
    left join public.shop_catalog_items catalog
      on demand.source_type = 'catalog' and catalog.id = demand.item_id
    where coalesce(ingredient.is_active, catalog.is_active, false)
  )
  select
    assessed.source_type,
    assessed.item_id,
    assessed.sku,
    assessed.item_name,
    assessed.unit,
    assessed.warehouse,
    (assessed.balance ->> 'balance')::numeric,
    assessed.required_stock,
    (assessed.balance ->> 'balance')::numeric - assessed.required_stock,
    case
      when (assessed.balance ->> 'balance') is null then assessed.required_stock
      else greatest(assessed.required_stock - (assessed.balance ->> 'balance')::numeric, 0)
    end,
    case
      when coalesce((assessed.balance ->> 'mapped')::boolean, false) is false then 'unmapped'
      when coalesce((assessed.balance ->> 'hasLedger')::boolean, false) is false then 'missing'
      when (assessed.balance ->> 'balance')::numeric < assessed.required_stock then 'shortage'
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
set search_path = public, pg_temp
as $$
  select catering_order.order_number,
    coalesce(nullif(catering_line.product_name_snapshot, ''), nullif(catering_line.content_snapshot, ''), '未命名項目'),
    (coalesce(catering_line.delivery_at, catering_order.delivery_at) at time zone 'Asia/Hong_Kong')::date
  from public.order_lines catering_line
  join public.orders catering_order on catering_order.id = catering_line.order_id
  where catering_order.document_type = 'order'
    and catering_order.archived_at is null
    and catering_order.merged_into_order_id is null
    and coalesce(catering_line.delivery_at, catering_order.delivery_at) >= (p_start_date::timestamp at time zone 'Asia/Hong_Kong')
    and coalesce(catering_line.delivery_at, catering_order.delivery_at) < ((p_start_date + greatest(1, least(coalesce(p_days, 14), 31)))::timestamp at time zone 'Asia/Hong_Kong')
    and coalesce(catering_order.delivery_status, '') not in ('已取消', '取消', 'Cancelled', 'cancelled')
    and catering_line.is_void is false
    and (catering_line.product_id is not null or catering_line.package_id is not null)
    and not exists (select 1 from public.order_list_manual_todos todo where todo.order_id = catering_order.id and todo.todo_key = 'cancelled')
    and not exists (select 1 from public.order_bom_requirements requirement where requirement.order_line_id = catering_line.id and requirement.ingredient_id is not null)
    and not exists (select 1 from public.product_ingredients recipe where recipe.product_id = catering_line.product_id and recipe.ingredient_id is not null)
    and not exists (select 1 from public.product_ingredients recipe where recipe.package_id = catering_line.package_id and recipe.ingredient_id is not null)
    and not exists (
      select 1
      from public.order_package_choice_snapshots choice
      join public.package_products package_product on package_product.id = choice.package_product_id
      join public.product_ingredients recipe on recipe.product_id = package_product.product_id
      where choice.order_line_id = catering_line.id and choice.is_selected and recipe.ingredient_id is not null
    )
  order by coalesce(catering_line.delivery_at, catering_order.delivery_at), catering_order.order_number, catering_line.item_order;
$$;

create or replace function public.enqueue_daily_inventory_forecast(
  p_run_date date default (timezone('Asia/Hong_Kong', now()))::date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not private.inventory_shortage_notifications_enabled() then
    return null;
  end if;

  insert into public.inventory_email_outbox (event_type, dedupe_key, payload)
  values (
    'daily_forecast',
    'daily_forecast:' || p_run_date::text,
    jsonb_build_object('startDate', p_run_date, 'days', 14)
  )
  on conflict (dedupe_key) do update set updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.refresh_inventory_minimum_stock_alerts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_balance jsonb;
  v_current numeric;
  v_previous public.inventory_email_alert_state%rowtype;
  v_had_previous boolean;
  v_below boolean;
  v_crossing integer;
  v_enqueued integer := 0;
begin
  if not private.inventory_shortage_notifications_enabled() then
    return 0;
  end if;

  for v_item in
    select 'catalog'::text as source_type, id, sku, name, unit, warehouse, minimum_stock_level
    from public.shop_catalog_items
    where is_active and channel = 'fc_internal' and warehouse is not null
      and minimum_stock_level is not null
    union all
    select 'ingredient', id, sku, name, coalesce(stocktake_unit, product_unit, ''),
      case when is_packing_stocktake then 'packing' else 'ingredient' end,
      minimum_stock_level
    from public.ingredients
    where is_active and archived_at is null
      and (is_ingredient_stocktake or is_packing_stocktake)
      and minimum_stock_level is not null
  loop
    v_balance := public.inventory_item_balance(v_item.source_type, v_item.id);
    v_current := (v_balance ->> 'balance')::numeric;
    v_below := v_current is not null and v_current <= v_item.minimum_stock_level;

    select * into v_previous
    from public.inventory_email_alert_state
    where source_type = v_item.source_type and source_id = v_item.id
    for update;
    v_had_previous := found;

    v_crossing := coalesce(v_previous.crossing_count, 0);
    if v_below and (not v_had_previous or not v_previous.below_minimum) then
      v_crossing := v_crossing + 1;
      insert into public.inventory_email_outbox (event_type, dedupe_key, payload)
      values (
        'minimum_stock',
        'minimum_stock:' || v_item.source_type || ':' || v_item.id::text || ':' || v_crossing::text,
        jsonb_build_object(
          'sourceType', v_item.source_type,
          'itemId', v_item.id,
          'sku', v_item.sku,
          'name', v_item.name,
          'unit', v_item.unit,
          'warehouse', v_item.warehouse,
          'currentStock', v_current,
          'minimumStock', v_item.minimum_stock_level
        )
      );
      v_enqueued := v_enqueued + 1;
    end if;

    insert into public.inventory_email_alert_state (
      source_type, source_id, below_minimum, crossing_count, current_stock,
      minimum_stock_level, last_checked_at, last_triggered_at, last_recovered_at
    ) values (
      v_item.source_type, v_item.id, v_below, v_crossing, v_current, v_item.minimum_stock_level, now(),
      case when v_below and (not v_had_previous or not v_previous.below_minimum) then now()
        else v_previous.last_triggered_at end,
      case when not v_below and coalesce(v_previous.below_minimum, false) then now()
        else v_previous.last_recovered_at end
    )
    on conflict (source_type, source_id) do update set
      below_minimum = excluded.below_minimum,
      crossing_count = excluded.crossing_count,
      current_stock = excluded.current_stock,
      minimum_stock_level = excluded.minimum_stock_level,
      last_checked_at = excluded.last_checked_at,
      last_triggered_at = coalesce(excluded.last_triggered_at, public.inventory_email_alert_state.last_triggered_at),
      last_recovered_at = coalesce(excluded.last_recovered_at, public.inventory_email_alert_state.last_recovered_at);
  end loop;
  return v_enqueued;
end;
$$;

create or replace function public.inventory_stock_change_refresh()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_inventory_minimum_stock_alerts();
  return null;
end;
$$;

drop trigger if exists inventory_minimum_after_dry_movement on public.shop_dry_stock_movements;
create trigger inventory_minimum_after_dry_movement
after insert or update or delete on public.shop_dry_stock_movements
for each statement execute function public.inventory_stock_change_refresh();

drop trigger if exists inventory_minimum_after_raw_movement on public.raw_meat_stock_movements;
create trigger inventory_minimum_after_raw_movement
after insert or update or delete on public.raw_meat_stock_movements
for each statement execute function public.inventory_stock_change_refresh();

drop trigger if exists inventory_minimum_after_prepared_movement on public.prepared_meat_stock_movements;
create trigger inventory_minimum_after_prepared_movement
after insert or update or delete on public.prepared_meat_stock_movements
for each statement execute function public.inventory_stock_change_refresh();

drop trigger if exists inventory_minimum_after_ingredient_stocktake on public.ingredient_stocktake_events;
create trigger inventory_minimum_after_ingredient_stocktake
after insert or update or delete on public.ingredient_stocktake_events
for each statement execute function public.inventory_stock_change_refresh();

drop trigger if exists inventory_minimum_after_packing_stocktake on public.packing_stocktake_events;
create trigger inventory_minimum_after_packing_stocktake
after insert or update or delete on public.packing_stocktake_events
for each statement execute function public.inventory_stock_change_refresh();

drop trigger if exists inventory_minimum_after_catalog_setting on public.shop_catalog_items;
create trigger inventory_minimum_after_catalog_setting
after update of minimum_stock_level on public.shop_catalog_items
for each statement execute function public.inventory_stock_change_refresh();

drop trigger if exists inventory_minimum_after_ingredient_setting on public.ingredients;
create trigger inventory_minimum_after_ingredient_setting
after update of minimum_stock_level on public.ingredients
for each statement execute function public.inventory_stock_change_refresh();

create or replace function public.set_shop_catalog_minimum_stock(
  p_catalog_item_id uuid,
  p_minimum_stock_level numeric
)
returns numeric
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.has_page_manage('workspace.factory.warehouse') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if p_minimum_stock_level is null or p_minimum_stock_level < 0 then
    raise exception 'minimum_stock_invalid' using errcode = '22023';
  end if;

  update public.shop_catalog_items
  set minimum_stock_level = p_minimum_stock_level, updated_at = now()
  where id = p_catalog_item_id and channel = 'fc_internal' and warehouse is not null;
  if not found then raise exception 'catalog_item_not_found' using errcode = 'P0002'; end if;

  perform public.refresh_inventory_minimum_stock_alerts();
  return p_minimum_stock_level;
end;
$$;

create or replace function public.set_ingredient_minimum_stock(
  p_ingredient_id uuid,
  p_minimum_stock_level numeric
)
returns numeric
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.has_page_manage('kitchen.ingredients') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if p_minimum_stock_level is null or p_minimum_stock_level < 0 then
    raise exception 'minimum_stock_invalid' using errcode = '22023';
  end if;
  update public.ingredients
  set minimum_stock_level = p_minimum_stock_level, updated_at = now()
  where id = p_ingredient_id and archived_at is null
    and (is_ingredient_stocktake or is_packing_stocktake);
  if not found then raise exception 'ingredient_not_found' using errcode = 'P0002'; end if;
  perform public.refresh_inventory_minimum_stock_alerts();
  return p_minimum_stock_level;
end;
$$;

create or replace function public.claim_inventory_email_notifications(p_limit integer default 25)
returns setof public.inventory_email_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.inventory_shortage_notifications_enabled() then
    return;
  end if;

  update public.inventory_email_outbox
  set status = 'pending', next_attempt_at = now(), updated_at = now(),
      last_error = coalesce(last_error, 'stale_claim_recovered')
  where status = 'processing' and claimed_at < now() - interval '15 minutes';

  return query
  update public.inventory_email_outbox outbox
  set status = 'processing', claimed_at = now(), attempt_count = outbox.attempt_count + 1,
      updated_at = now()
  where outbox.id in (
    select candidate.id
    from public.inventory_email_outbox candidate
    where candidate.status = 'pending' and candidate.next_attempt_at <= now()
    order by candidate.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  returning outbox.*;
end;
$$;

revoke all on function public.inventory_catalog_balance(uuid) from public, anon, authenticated;
revoke all on function public.inventory_item_balance(text, uuid) from public, anon, authenticated;
revoke all on function public.inventory_forecast_shortages(date, integer) from public, anon, authenticated;
revoke all on function public.inventory_forecast_unmapped_order_lines(date, integer) from public, anon, authenticated;
revoke all on function public.enqueue_daily_inventory_forecast(date) from public, anon, authenticated;
revoke all on function public.refresh_inventory_minimum_stock_alerts() from public, anon, authenticated;
revoke all on function public.inventory_stock_change_refresh() from public, anon, authenticated;
revoke all on function public.claim_inventory_email_notifications(integer) from public, anon, authenticated;
revoke all on function public.set_shop_catalog_minimum_stock(uuid, numeric) from public, anon;
revoke all on function public.set_ingredient_minimum_stock(uuid, numeric) from public, anon;
revoke all on function public.get_inventory_shortage_notification_control() from public, anon;
revoke all on function public.set_inventory_shortage_notifications_enabled(boolean) from public, anon;
revoke all on function private.inventory_shortage_notifications_enabled() from public, anon, authenticated;
grant execute on function public.inventory_catalog_balance(uuid) to service_role;
grant execute on function public.inventory_item_balance(text, uuid) to service_role;
grant execute on function public.inventory_forecast_shortages(date, integer) to service_role;
grant execute on function public.inventory_forecast_unmapped_order_lines(date, integer) to service_role;
grant execute on function public.enqueue_daily_inventory_forecast(date) to service_role;
grant execute on function public.refresh_inventory_minimum_stock_alerts() to service_role;
grant execute on function public.claim_inventory_email_notifications(integer) to service_role;
grant execute on function public.set_shop_catalog_minimum_stock(uuid, numeric) to authenticated;
grant execute on function public.set_ingredient_minimum_stock(uuid, numeric) to authenticated;
grant execute on function public.get_inventory_shortage_notification_control() to authenticated;
grant execute on function public.set_inventory_shortage_notifications_enabled(boolean) to authenticated;

select cron.unschedule(jobid) from cron.job
where jobname in ('fccd-inventory-daily-forecast', 'fccd-inventory-email-worker');

do $deployment$
declare
  v_function_url text;
  v_cron_secret text;
begin
  perform cron.schedule(
    'fccd-inventory-daily-forecast',
    '0 16 * * *',
    $cron$select public.enqueue_daily_inventory_forecast()$cron$
  );

  select decrypted_secret into v_function_url
  from vault.decrypted_secrets
  where name = 'inventory_email_function_url' limit 1;
  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets
  where name = 'inventory_email_cron_secret' limit 1;

  if nullif(btrim(v_function_url), '') is not null
    and nullif(btrim(v_cron_secret), '') is not null then
    perform cron.schedule(
      'fccd-inventory-email-worker',
      '* * * * *',
      $cron$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'inventory_email_function_url' limit 1),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
              select decrypted_secret from vault.decrypted_secrets
              where name = 'inventory_email_cron_secret' limit 1
            )
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 120000
        );
      $cron$
    );
  end if;
end;
$deployment$;
