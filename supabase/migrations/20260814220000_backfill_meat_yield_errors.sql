-- Backfill 收成錯誤 from historical prepared-meat inbound that already has
-- linked raw outbound kg. Re-runnable: upserts on prepared_stock_movement_id.
-- Uses the same 預算收成 RPC and 10% rule as record_meat_yield_error_if_needed.

create or replace function private.backfill_meat_yield_errors()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  with inbound as (
    select
      prep.id,
      prep.prepared_meat_item_id,
      prep.inbound_packages,
      prep.remarks,
      coalesce(prep.movement_at, prep.bubble_created_at, prep.created_at)
        as production_at,
      coalesce(sum(raw.outbound_quantity_kg), 0) as raw_kg,
      (
        array_agg(raw.raw_meat_item_id order by raw.outbound_quantity_kg desc nulls last)
        filter (where raw.raw_meat_item_id is not null)
      )[1] as raw_meat_item_id,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'raw_stock_movement_id', raw.id,
            'legacy_id', raw.legacy_id,
            'outbound_kg', raw.outbound_quantity_kg
          )
          order by raw.outbound_quantity_kg desc nulls last
        ) filter (where raw.id is not null),
        '[]'::jsonb
      ) as source_lots
    from public.prepared_meat_stock_movements as prep
    left join public.prepared_meat_stock_raw_sources as src
      on src.prepared_movement_id = prep.id
    left join public.raw_meat_stock_movements as raw
      on raw.id = src.raw_stock_movement_id
    where prep.inbound_packages is not null
      and prep.inbound_packages > 0
      and prep.prepared_meat_item_id is not null
    group by prep.id
  ),
  scored as (
    select
      inbound.id,
      inbound.prepared_meat_item_id,
      inbound.inbound_packages,
      inbound.remarks,
      inbound.production_at,
      inbound.raw_kg,
      inbound.source_lots,
      estimate.raw_meat_item_id as estimate_raw_id,
      estimate.raw_meat_name,
      estimate.prepared_meat_name,
      estimate.kg_per_package,
      estimate.seasoning_ratio,
      estimate.variation_rate,
      estimate.expected_output_kg,
      estimate.expected_packs,
      estimate.formula_version,
      inbound.inbound_packages - estimate.expected_packs as deviation_packs,
      (inbound.inbound_packages - estimate.expected_packs)
        / estimate.expected_packs as deviation_ratio
    from inbound
    join lateral public.estimate_prepared_meat_yield(
      inbound.prepared_meat_item_id,
      inbound.raw_kg,
      inbound.raw_meat_item_id
    ) as estimate on true
    where estimate.expected_packs is not null
      and estimate.expected_packs > 0
      and abs(inbound.inbound_packages - estimate.expected_packs)
        / estimate.expected_packs > 0.10
  ),
  upserted as (
    insert into public.meat_yield_errors (
      production_at,
      raw_meat_item_id,
      raw_meat_name_snapshot,
      prepared_meat_item_id,
      prepared_meat_name_snapshot,
      prepared_stock_movement_id,
      raw_input_kg,
      kg_per_package,
      seasoning_ratio,
      variation_rate,
      expected_output_kg,
      expected_packs,
      actual_packs,
      actual_output_kg,
      deviation_packs,
      deviation_ratio,
      deviation_direction,
      threshold_ratio,
      formula_version,
      source_lots,
      remarks
    )
    select
      scored.production_at,
      scored.estimate_raw_id,
      scored.raw_meat_name,
      scored.prepared_meat_item_id,
      scored.prepared_meat_name,
      scored.id,
      scored.raw_kg,
      scored.kg_per_package,
      scored.seasoning_ratio,
      scored.variation_rate,
      scored.expected_output_kg,
      scored.expected_packs,
      scored.inbound_packages,
      case
        when scored.kg_per_package is null then null
        else round(scored.inbound_packages * scored.kg_per_package, 3)
      end,
      scored.deviation_packs,
      round(scored.deviation_ratio, 6),
      case
        when scored.deviation_packs > 0 then 'over'
        else 'under'
      end,
      0.10,
      scored.formula_version,
      scored.source_lots,
      nullif(btrim(coalesce(scored.remarks, '')), '')
    from scored
    on conflict (prepared_stock_movement_id) do update
    set
      production_at = excluded.production_at,
      raw_meat_item_id = excluded.raw_meat_item_id,
      raw_meat_name_snapshot = excluded.raw_meat_name_snapshot,
      prepared_meat_item_id = excluded.prepared_meat_item_id,
      prepared_meat_name_snapshot = excluded.prepared_meat_name_snapshot,
      raw_input_kg = excluded.raw_input_kg,
      kg_per_package = excluded.kg_per_package,
      seasoning_ratio = excluded.seasoning_ratio,
      variation_rate = excluded.variation_rate,
      expected_output_kg = excluded.expected_output_kg,
      expected_packs = excluded.expected_packs,
      actual_packs = excluded.actual_packs,
      actual_output_kg = excluded.actual_output_kg,
      deviation_packs = excluded.deviation_packs,
      deviation_ratio = excluded.deviation_ratio,
      deviation_direction = excluded.deviation_direction,
      threshold_ratio = excluded.threshold_ratio,
      formula_version = excluded.formula_version,
      source_lots = excluded.source_lots,
      remarks = excluded.remarks
    returning 1
  )
  select count(*)::integer
  into inserted_count
  from upserted;

  return inserted_count;
end;
$$;

revoke all on function private.backfill_meat_yield_errors() from public, anon, authenticated;
grant execute on function private.backfill_meat_yield_errors() to service_role;

comment on function private.backfill_meat_yield_errors() is
  'Upserts 收成錯誤 from prepared inbound rows whose pack count misses 預算收成 by more than 10%.';

select private.backfill_meat_yield_errors();
