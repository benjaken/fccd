-- Restore the private helper that public.push_monthly_meat_prices calls.
-- After outbound auto-refresh triggers were dropped, this function was missing
-- on production. Postgres 42883 ("function does not exist") is returned by
-- PostgREST as HTTP 404 on /rpc/push_monthly_meat_prices.
-- Do not recreate the outbound triggers; month prices are pushed from the UI.

create or replace function private.refresh_monthly_meat_prices(
  p_raw_meat_item_id uuid,
  p_movement_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start timestamptz;
  month_end timestamptz;
  version_count integer;
  avg_room numeric(14, 4);
  avg_shop numeric(14, 4);
  shop_rows integer := 0;
  room_rows integer := 0;
begin
  if p_raw_meat_item_id is null or p_movement_at is null then
    return jsonb_build_object('status', 'skipped_missing_keys');
  end if;

  month_start :=
    date_trunc('month', p_movement_at at time zone 'Asia/Hong_Kong')
    at time zone 'Asia/Hong_Kong';
  month_end :=
    (
      date_trunc('month', p_movement_at at time zone 'Asia/Hong_Kong')
      + interval '1 month'
    ) at time zone 'Asia/Hong_Kong';

  select count(*)
  into version_count
  from public.meat_price_versions as price
  where price.raw_meat_item_id = p_raw_meat_item_id
    and price.month_at >= month_start
    and price.month_at < month_end;

  if version_count = 0 then
    return jsonb_build_object(
      'status', 'skipped_no_versions',
      'month_start', month_start
    );
  end if;

  with outbound as (
    select
      movement.id,
      movement.outbound_quantity_kg,
      movement.applied_seasoning_per_kg,
      coalesce(movement.applied_variation_rate, 0) as variation_rate,
      coalesce(movement.applied_markup_rate, 0) as markup_rate
    from public.raw_meat_stock_movements as movement
    where movement.raw_meat_item_id = p_raw_meat_item_id
      and movement.outbound_quantity_kg > 0
      and movement.movement_at >= month_start
      and movement.movement_at < month_end
  ),
  inbound_price as (
    select
      rel.movement_id,
      avg(inbound.inbound_unit_price) as inbound_unit_price
    from public.raw_meat_stock_relations as rel
    join public.raw_meat_stock_movements as inbound
      on inbound.id = rel.inbound_movement_id
    join outbound on outbound.id = rel.movement_id
    where inbound.inbound_unit_price is not null
    group by rel.movement_id
  ),
  yield as (
    select
      src.raw_stock_movement_id as movement_id,
      sum(prep.inbound_packages * item.kg_per_package) as yield_kg
    from public.prepared_meat_stock_raw_sources as src
    join public.prepared_meat_stock_movements as prep
      on prep.id = src.prepared_movement_id
    join public.prepared_meat_items as item
      on item.id = prep.prepared_meat_item_id
    join outbound on outbound.id = src.raw_stock_movement_id
    where prep.inbound_packages > 0
      and item.kg_per_package > 0
    group by src.raw_stock_movement_id
  ),
  unit_prices as (
    select
      (
        (
          outbound.outbound_quantity_kg * inbound_price.inbound_unit_price
          + outbound.outbound_quantity_kg
            * coalesce(outbound.applied_seasoning_per_kg, 0)
        )
        * (1 + outbound.variation_rate)
        / yield.yield_kg
      ) as room_price,
      (
        (
          outbound.outbound_quantity_kg * inbound_price.inbound_unit_price
          + outbound.outbound_quantity_kg
            * coalesce(outbound.applied_seasoning_per_kg, 0)
        )
        * (1 + outbound.variation_rate)
        / yield.yield_kg
      ) * (1 + outbound.markup_rate) as shop_price
    from outbound
    join inbound_price on inbound_price.movement_id = outbound.id
    join yield on yield.movement_id = outbound.id
    where yield.yield_kg > 0
  )
  select
    round(avg(unit_prices.room_price), 4),
    round(avg(unit_prices.shop_price), 4)
  into avg_room, avg_shop
  from unit_prices;

  if avg_room is null or avg_shop is null then
    return jsonb_build_object(
      'status', 'skipped_no_computable_rows',
      'month_start', month_start,
      'version_count', version_count
    );
  end if;

  update public.meat_price_versions as price
  set shop_price = avg_shop
  where price.raw_meat_item_id = p_raw_meat_item_id
    and price.month_at >= month_start
    and price.month_at < month_end
    and price.shop_price is not null;

  get diagnostics shop_rows = row_count;

  update public.meat_price_versions as price
  set room_price = avg_room
  where price.raw_meat_item_id = p_raw_meat_item_id
    and price.month_at >= month_start
    and price.month_at < month_end
    and price.room_price is not null;

  get diagnostics room_rows = row_count;

  return jsonb_build_object(
    'status', 'updated',
    'month_start', month_start,
    'shop_price', avg_shop,
    'room_price', avg_room,
    'shop_rows', shop_rows,
    'room_rows', room_rows,
    'version_count', version_count
  );
end;
$$;

revoke all on function private.refresh_monthly_meat_prices(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function private.refresh_monthly_meat_prices(uuid, timestamptz)
  to postgres, service_role;

comment on function private.refresh_monthly_meat_prices(uuid, timestamptz) is
  'Recomputes shop/factory monthly meat prices for one raw meat + HKT month. Skips when no meat_price_versions rows exist. Averages per-outbound unit prices (not kg-weighted). Updates shop-only and room-only rows separately.';
