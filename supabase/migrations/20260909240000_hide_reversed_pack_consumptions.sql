-- Reversed piece-count rows still appear as 訂單消耗 because the ledger
-- marked only the compensating adjustment as a reversal. Hide the original
-- consumption too, and drop leftover pack-item piece rows (18/36/9 包).
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
      consumption.reversed_at is not null
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

delete from public.order_material_consumptions
where reversed_at is not null
  and ingredient_id in (
    '20f63a30-dddc-4b70-9678-a49a4588289a',
    '0679cf01-5b58-4741-b8cd-c550786ae378',
    '214ba671-c489-493c-b523-ddd650870371',
    'a58027e0-cabd-4929-a7b2-ff08a7e7097a',
    'f502bb28-f51c-4aed-a19c-beaea123f9b9',
    '5eedbacd-beb6-486d-acf7-958c9d51797e',
    '7bdf08a0-4b7b-403e-a151-39b3eb0d0c58',
    '7ca810d6-79e7-485a-94ad-0838889cc009',
    '465519db-28fd-4909-befd-feac50ad8fb1',
    'cc87d8a5-9d90-457b-bedf-0d70a91a046b',
    'dbfd8272-2e2f-490b-90b4-c0ae45c4d9e5',
    '4cfbd0de-4e40-45f2-bb42-34ee4bed6dde',
    'd8ec322b-ca9f-4373-a580-ea1fc49077f9',
    '43896ea2-3eab-4ca7-a1f6-ca768c55530c',
    'f0cab1a1-f8c8-4bee-a328-cfd7e68377f6',
    '191051a3-c7dc-4710-923d-d777edde939d',
    '95c2cfd0-12f9-45f2-83bb-6d311ee4e80e',
    '66cb4630-a1bb-4246-9efc-a2d78a178ff3',
    'f60025c0-2898-4037-9233-fd4d08b73c74',
    '114855f4-c873-4b08-9987-ae337cae3fbc',
    '07faab2a-d15f-4f3e-92f1-6a03270bc07a',
    'f84d4586-8886-4063-8c8d-4dff15840862',
    'e12b0e6c-1219-46da-b790-1b3bbc7f2570',
    '56bb20ec-3cea-4845-bf0c-b6cab9aceee5',
    '6214c33b-0e50-4946-98c5-6a575c7b0e38',
    '41be0a73-850b-45d6-8f72-42ec107e3992',
    'cfe23f0b-167d-4063-9ca1-d9b129132d47',
    '5a3baf1d-6c5e-4b2d-8357-57afd312a4ea',
    'bc170d41-af01-4d0e-a8d7-4fe01da4d8dd',
    '79a87cea-f762-4e5c-b39a-b97ca37065ed',
    '3bc62234-fab9-4d2c-a016-1db915916e77',
    '3f49cc82-0e85-44f0-8574-2de3ab3d9d3e',
    '2f524709-98af-4a14-b3f2-d812382580b1',
    '3923c216-12e3-4eea-9fcf-125df974e1f9',
    'b35dc0c3-aeb8-4f48-840f-af9f7a4437ad',
    '273ea008-29a0-4bbe-a4c2-92d410e921a6',
    'e4a5354a-191f-4a8b-bc56-9fc05874a3c4',
    '0901532c-46bc-4f5f-a4f3-149e64ff61ee',
    'eaa66028-2497-4f27-b7c5-4d47e152a3ee',
    'e60dbeb9-d01a-47e4-b5b3-ca8874b3be9c',
    'f12ae3ab-73b3-4d68-a528-f0271bc49530',
    'c1795f8a-f3e2-41a9-8418-c35fb1eefca8',
    'bf09e571-37aa-482e-a831-e9dca88e5fa8',
    '7a4128a8-9af0-454a-8bc8-9c6a39d519d6',
    '3bd272e7-721e-4164-841d-9bd830f821ef',
    'a69a6543-644a-4e77-9328-4cbb5ca3d7e0',
    '41c21441-0b2d-400d-a748-bd8ed0987b5c',
    'f3b1cf13-a21b-4319-ab1d-ea3b09692f3b',
    'fd5a0d20-96d9-4fce-8a54-d486bfd65ff9',
    '693e0c0d-3b08-4aa2-88c5-ba86646156a0',
    '7eb7f487-d68b-473c-a5c0-f73133bcc781',
    'be131103-41b1-4fe2-ab7b-b3fb310125bf',
    '4b5da9c5-4032-4cdc-84b8-2e1a40ac6b92',
    'f81ed035-cac3-4ea5-a7d2-2f3e47a926e0',
    '44c898dd-32d7-4100-ab6b-5e03f0c15c53',
    '076b1584-078c-439b-8bf4-b557ebe093f9',
    '7f625137-85aa-453c-84d5-d9dda7950342',
    '89e79bf7-a64c-40d6-9a0e-4b0a088618d9',
    '8f685de4-9ce3-48c7-bcf1-58ef9aa9bf9d',
    '36d4be5b-7ea1-4630-9003-c05a07e1bf88',
    '7a32395e-b91c-48cf-92a3-57e874fe4788',
    'dcad7ea7-6a27-41df-acdc-0daa38188393',
    '9c756f7b-8e95-4f61-b878-d3ceb8b6b9a4',
    '9788c374-560e-4546-8c15-d0dc85a2d759'
  );
