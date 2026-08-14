-- 預算收成 = ceil((歷史入貨包數 / 歷史生肉出貨 kg) * 今次出貨 kg)
-- matches Bubble: (sum in/包 / sum from_rawStock_list.out_quantity(kg)) * current kg :ceiling

create or replace function private.prepared_meat_budgeted_yield_packs(
  p_prepared_meat_item_id uuid,
  p_outbound_kg numeric,
  p_kg_per_package numeric
)
returns numeric
language sql
stable
set search_path = public
as $$
  with history as (
    select
      coalesce(
        (
          select sum(prep.inbound_packages)
          from public.prepared_meat_stock_movements as prep
          where prep.prepared_meat_item_id = p_prepared_meat_item_id
            and coalesce(prep.inbound_packages, 0) > 0
        ),
        0
      ) as inbound_packs,
      coalesce(
        (
          select sum(raw.outbound_quantity_kg)
          from public.prepared_meat_stock_movements as prep
          join public.prepared_meat_stock_raw_sources as src
            on src.prepared_movement_id = prep.id
          join public.raw_meat_stock_movements as raw
            on raw.id = src.raw_stock_movement_id
          where prep.prepared_meat_item_id = p_prepared_meat_item_id
            and coalesce(prep.inbound_packages, 0) > 0
        ),
        0
      ) as raw_out_kg
  )
  select case
    when p_outbound_kg is null or p_outbound_kg <= 0 then 0
    when history.inbound_packs > 0 and history.raw_out_kg > 0 then
      ceil((history.inbound_packs * p_outbound_kg) / history.raw_out_kg)
    when coalesce(p_kg_per_package, 0) > 0 then
      ceil(p_outbound_kg / p_kg_per_package)
    else 0
  end
  from history;
$$;

comment on function private.prepared_meat_budgeted_yield_packs(uuid, numeric, numeric) is
  'Budgeted prepared inbound packs: ceil((historical inbound packs / historical raw outbound kg) * current outbound kg). Falls back to ceil(outbound kg / kg per package) when history is missing.';
