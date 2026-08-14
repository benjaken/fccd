-- 預算收成 matches Bubble Text on the 生肉出貨 prepared-meat row:
-- ceiling(Σ in/包 / Σ from_rawStock_list out_quantity(kg) × current outbound kg)

drop function if exists public.estimate_prepared_meat_yield(uuid, numeric, uuid);

create function public.estimate_prepared_meat_yield(
  p_prepared_meat_item_id uuid,
  p_raw_input_kg numeric,
  p_raw_meat_item_id uuid default null,
  p_exclude_prepared_stock_movement_id uuid default null
)
returns table (
  raw_input_kg numeric,
  raw_meat_item_id uuid,
  prepared_meat_item_id uuid,
  raw_meat_name text,
  prepared_meat_name text,
  kg_per_package numeric,
  seasoning_ratio numeric,
  variation_rate numeric,
  expected_output_kg numeric,
  expected_packs numeric,
  formula_version text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_prepared public.prepared_meat_items%rowtype;
  v_raw public.raw_meat_items%rowtype;
  v_raw_id uuid;
  v_hist_packs numeric := 0;
  v_hist_raw_kg numeric := 0;
  v_packs numeric;
begin
  if p_prepared_meat_item_id is null or p_raw_input_kg is null or p_raw_input_kg <= 0 then
    return;
  end if;

  select *
  into v_prepared
  from public.prepared_meat_items as prepared
  where prepared.id = p_prepared_meat_item_id;

  if not found then
    return;
  end if;

  v_raw_id := coalesce(p_raw_meat_item_id, v_prepared.raw_meat_item_id);

  if v_raw_id is not null then
    select *
    into v_raw
    from public.raw_meat_items as raw_item
    where raw_item.id = v_raw_id;
  end if;

  select coalesce(sum(prep.inbound_packages), 0)
  into v_hist_packs
  from public.prepared_meat_stock_movements as prep
  where prep.prepared_meat_item_id = p_prepared_meat_item_id
    and (
      p_exclude_prepared_stock_movement_id is null
      or prep.id <> p_exclude_prepared_stock_movement_id
    );

  select coalesce(sum(raw.outbound_quantity_kg), 0)
  into v_hist_raw_kg
  from public.prepared_meat_stock_movements as prep
  join public.prepared_meat_stock_raw_sources as src
    on src.prepared_movement_id = prep.id
  join public.raw_meat_stock_movements as raw
    on raw.id = src.raw_stock_movement_id
  where prep.prepared_meat_item_id = p_prepared_meat_item_id
    and (
      p_exclude_prepared_stock_movement_id is null
      or prep.id <> p_exclude_prepared_stock_movement_id
    );

  if v_hist_packs is null or v_hist_packs <= 0 or v_hist_raw_kg is null or v_hist_raw_kg <= 0 then
    return;
  end if;

  v_packs := ceil(v_hist_packs / v_hist_raw_kg * p_raw_input_kg);

  if v_packs is null or v_packs <= 0 then
    return;
  end if;

  raw_input_kg := p_raw_input_kg;
  raw_meat_item_id := v_raw_id;
  prepared_meat_item_id := v_prepared.id;
  raw_meat_name := v_raw.name;
  prepared_meat_name := v_prepared.name;
  kg_per_package := v_prepared.kg_per_package;
  seasoning_ratio := 0;
  variation_rate := 0;
  expected_output_kg := case
    when v_prepared.kg_per_package is null then round(v_hist_packs / v_hist_raw_kg * p_raw_input_kg, 3)
    else round(v_packs * v_prepared.kg_per_package, 3)
  end;
  expected_packs := v_packs;
  formula_version := 'historical_packs_per_kg_ceiling_v1';
  return next;
end;
$$;

revoke all on function public.estimate_prepared_meat_yield(uuid, numeric, uuid, uuid)
  from public, anon;
grant execute on function public.estimate_prepared_meat_yield(uuid, numeric, uuid, uuid)
  to authenticated, service_role;

comment on function public.estimate_prepared_meat_yield(uuid, numeric, uuid, uuid) is
  '預算收成: ceiling(Σ historical in/包 / Σ historical raw out kg × current raw kg). Invoker RLS.';

comment on column public.meat_yield_errors.expected_packs is
  '預算收成（包）= ceiling(Σ in/包 / Σ from_rawStock out_quantity(kg) × current raw kg)';

create or replace function private.backfill_meat_yield_errors()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  delete from public.meat_yield_errors;

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
      inbound.raw_meat_item_id,
      inbound.id
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
    returning 1
  )
  select count(*)::integer
  into inserted_count
  from upserted;

  return inserted_count;
end;
$$;

select private.backfill_meat_yield_errors();
