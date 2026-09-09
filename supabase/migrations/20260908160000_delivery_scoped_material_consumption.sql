-- Deduct catering ingredients and packaging per fulfilled delivery. A line can
-- be assigned explicitly; legacy lines fall back to an exact delivery time,
-- or to the only active delivery on the order.

alter table public.order_lines
  add column if not exists delivery_id uuid references public.deliveries(id) on delete set null;

create index if not exists order_lines_delivery_id_idx
  on public.order_lines (delivery_id) where delivery_id is not null;

create or replace function private.record_delivered_delivery_material_consumption(
  p_delivery_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order_id uuid;
  v_delivery_at timestamptz;
  v_consumed_at timestamptz;
  v_active_delivery_count integer;
  v_inserted integer := 0;
begin
  select delivery.order_id, delivery.delivery_at, delivery.fulfilled_at
  into v_order_id, v_delivery_at, v_consumed_at
  from public.deliveries delivery
  join public.orders orders on orders.id = delivery.order_id
  where delivery.id = p_delivery_id
    and delivery.fulfilled_at is not null
    and coalesce(delivery.delivery_status, '') not in ('已取消', '取消', 'Cancelled', 'cancelled')
    and orders.document_type = 'order'
    and orders.archived_at is null
    and orders.merged_into_order_id is null;
  if not found then return 0; end if;

  select count(*) into v_active_delivery_count
  from public.deliveries delivery
  where delivery.order_id = v_order_id
    and coalesce(delivery.delivery_status, '') not in ('已取消', '取消', 'Cancelled', 'cancelled');

  with live_lines as (
    select line.*
    from public.order_lines line
    where line.order_id = v_order_id
      and line.is_void is false
      and (
        line.delivery_id = p_delivery_id
        or (line.delivery_id is null and line.delivery_at = v_delivery_at)
        or (line.delivery_id is null and line.delivery_at is null and v_active_delivery_count = 1)
      )
  ), snapshot_demand as (
    select line.id as order_line_id, requirement.ingredient_id,
      sum(coalesce(
        requirement.calculated_quantity,
        requirement.ingredient_quantity * coalesce(requirement.product_quantity, line.quantity, 0),
        0
      ))::numeric as quantity,
      'order_bom'::text as calculation_source
    from live_lines line
    join public.order_bom_requirements requirement on requirement.order_line_id = line.id
    where requirement.ingredient_id is not null
    group by line.id, requirement.ingredient_id
  ), product_demand as (
    select line.id as order_line_id, recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0) * coalesce(line.quantity, 0))::numeric as quantity,
      'product_bom'::text as calculation_source
    from live_lines line
    join public.product_ingredients recipe on recipe.product_id = line.product_id
    where line.product_id is not null
      and not exists (select 1 from public.order_bom_requirements r where r.order_line_id = line.id)
      and recipe.ingredient_id is not null
    group by line.id, recipe.ingredient_id
  ), package_demand as (
    select line.id as order_line_id, recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0) * coalesce(line.quantity, 0))::numeric as quantity,
      'package_bom'::text as calculation_source
    from live_lines line
    join public.product_ingredients recipe on recipe.package_id = line.package_id
    where line.package_id is not null
      and not exists (select 1 from public.order_bom_requirements r where r.order_line_id = line.id)
      and recipe.ingredient_id is not null
    group by line.id, recipe.ingredient_id
  ), selected_package_products as (
    select line.id as order_line_id, recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(package_product.quantity, 1) * coalesce(line.quantity, 0))::numeric as quantity,
      'package_bom'::text as calculation_source
    from live_lines line
    join public.order_package_choice_snapshots choice
      on choice.order_line_id = line.id and choice.is_selected
    join public.package_products package_product on package_product.id = choice.package_product_id
    join public.product_ingredients recipe on recipe.product_id = package_product.product_id
    where line.package_id is not null
      and not exists (select 1 from public.order_bom_requirements r where r.order_line_id = line.id)
      and recipe.ingredient_id is not null
    group by line.id, recipe.ingredient_id
  ), default_package_products as (
    select line.id as order_line_id, recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(package_product.quantity, 1) * coalesce(line.quantity, 0))::numeric as quantity,
      'package_bom'::text as calculation_source
    from live_lines line
    join public.package_products package_product
      on package_product.package_id = line.package_id and package_product.is_selected
    join public.product_ingredients recipe on recipe.product_id = package_product.product_id
    where line.package_id is not null
      and not exists (select 1 from public.order_bom_requirements r where r.order_line_id = line.id)
      and not exists (select 1 from public.order_package_choice_snapshots c where c.order_line_id = line.id)
      and recipe.ingredient_id is not null
    group by line.id, recipe.ingredient_id
  ), demand as (
    select combined.order_line_id, combined.ingredient_id,
      sum(combined.quantity)::numeric as quantity,
      case when bool_or(combined.calculation_source = 'order_bom') then 'order_bom'
        when bool_or(combined.calculation_source = 'package_bom') then 'package_bom'
        else 'product_bom' end as calculation_source
    from (
      select * from snapshot_demand union all select * from product_demand
      union all select * from package_demand union all select * from selected_package_products
      union all select * from default_package_products
    ) combined
    group by combined.order_line_id, combined.ingredient_id
  )
  insert into public.order_material_consumptions (
    order_id, delivery_id, order_line_id, ingredient_id, quantity,
    consumed_at, calculation_source, metadata
  )
  select v_order_id, p_delivery_id, demand.order_line_id, demand.ingredient_id,
    demand.quantity, v_consumed_at, demand.calculation_source,
    jsonb_build_object('deliveryCompleted', true, 'deliveryId', p_delivery_id)
  from demand
  where demand.quantity > 0
  on conflict (order_line_id, ingredient_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function private.record_delivered_order_material_consumption(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_delivery record;
  v_inserted integer := 0;
begin
  for v_delivery in
    select delivery.id
    from public.deliveries delivery
    where delivery.order_id = p_order_id
      and delivery.fulfilled_at is not null
      and coalesce(delivery.delivery_status, '') not in ('已取消', '取消', 'Cancelled', 'cancelled')
  loop
    v_inserted := v_inserted
      + private.record_delivered_delivery_material_consumption(v_delivery.id);
  end loop;
  return v_inserted;
end;
$$;

create or replace function private.consume_materials_when_delivery_fulfilled()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.fulfilled_at is not null
    and new.fulfilled_at is distinct from old.fulfilled_at then
    perform private.record_delivered_delivery_material_consumption(new.id);
  end if;
  return new;
end;
$$;

create or replace function private.refresh_minimum_after_material_consumption()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if private.inventory_shortage_notifications_enabled() then
    perform public.refresh_inventory_minimum_stock_alerts();
  end if;
  return null;
end;
$$;

drop trigger if exists refresh_minimum_after_material_consumption
  on public.order_material_consumptions;
create trigger refresh_minimum_after_material_consumption
after insert on public.order_material_consumptions
for each statement execute function private.refresh_minimum_after_material_consumption();

revoke all on function private.record_delivered_delivery_material_consumption(uuid)
  from public, anon, authenticated;
revoke all on function private.refresh_minimum_after_material_consumption()
  from public, anon, authenticated;

comment on column public.order_lines.delivery_id is
  'Explicit delivery assignment for split-delivery material consumption.';
