-- 收成錯誤: record prepared-meat inbound pack counts that miss 預算收成 by >10%.
-- 預算收成 = round(raw_kg × (1 + seasoning_ratio + variation_rate) / kg_per_package)

create table public.meat_yield_errors (
  id uuid primary key default gen_random_uuid(),
  production_at timestamptz not null default now(),
  raw_meat_item_id uuid references public.raw_meat_items (id),
  raw_meat_name_snapshot text,
  prepared_meat_item_id uuid references public.prepared_meat_items (id),
  prepared_meat_name_snapshot text,
  prepared_stock_movement_id uuid unique
    references public.prepared_meat_stock_movements (id),
  raw_input_kg numeric(14, 3) not null,
  kg_per_package numeric(14, 3),
  seasoning_ratio numeric(12, 6) not null default 0,
  variation_rate numeric(10, 6) not null default 0,
  expected_output_kg numeric(14, 3) not null,
  expected_packs numeric(14, 0) not null,
  actual_packs numeric(14, 3) not null,
  actual_output_kg numeric(14, 3),
  deviation_packs numeric(14, 3) not null,
  deviation_ratio numeric(12, 6) not null,
  deviation_direction text not null,
  threshold_ratio numeric(12, 6) not null default 0.10,
  formula_version text not null default 'raw_plus_seasoning_plus_variation_v1',
  source_lots jsonb not null default '[]'::jsonb,
  remarks text,
  recorded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (raw_input_kg > 0),
  check (expected_packs > 0),
  check (threshold_ratio > 0),
  check (deviation_direction in ('over', 'under')),
  check (formula_version <> '')
);

comment on table public.meat_yield_errors is
  '收成錯誤: 生肉出貨實際入貨包數偏離預算收成超過 10% 的記錄。';
comment on column public.meat_yield_errors.expected_packs is
  '預算收成（包）= round(raw_kg × (1 + seasoning_ratio + variation_rate) / kg_per_package)';
comment on column public.meat_yield_errors.deviation_ratio is
  '(actual_packs - expected_packs) / expected_packs';
comment on column public.meat_yield_errors.source_lots is
  'Selected inbound raw lots and dispatched kg at the time of recording.';

create index meat_yield_errors_production_at_idx
  on public.meat_yield_errors (production_at desc);
create index meat_yield_errors_prepared_meat_item_id_idx
  on public.meat_yield_errors (prepared_meat_item_id);
create index meat_yield_errors_raw_meat_item_id_idx
  on public.meat_yield_errors (raw_meat_item_id);
create index meat_yield_errors_recorded_by_idx
  on public.meat_yield_errors (recorded_by)
  where recorded_by is not null;

alter table public.meat_yield_errors enable row level security;

grant select, insert, update, delete on public.meat_yield_errors to authenticated;

create policy "Production reads meat yield errors"
on public.meat_yield_errors
for select
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting', 'Factory')
);

create policy "Production inserts meat yield errors"
on public.meat_yield_errors
for insert
to authenticated
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Factory')
);

create policy "Administrators update meat yield errors"
on public.meat_yield_errors
for update
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
)
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
);

create policy "Super Admin deletes meat yield errors"
on public.meat_yield_errors
for delete
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

create or replace function public.estimate_prepared_meat_yield(
  p_prepared_meat_item_id uuid,
  p_raw_input_kg numeric,
  p_raw_meat_item_id uuid default null
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
  v_seasoning_ratio numeric := 0;
  v_variation numeric := 0;
  v_output_kg numeric;
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

  select
    coalesce(
      sum(recipe.seasoning_quantity_grams) / 1000.0
        / nullif(max(recipe.production_raw_meat_kg), 0),
      0
    )
  into v_seasoning_ratio
  from public.meat_seasoning_cost_versions as recipe
  where recipe.is_applied
    and (
      recipe.prepared_meat_item_id = p_prepared_meat_item_id
      or (
        recipe.prepared_meat_item_id is null
        and v_raw_id is not null
        and recipe.raw_meat_item_id = v_raw_id
      )
    );

  v_variation := coalesce(
    v_raw.current_variation_rate,
    (
      select settings.variation_rate
      from public.meat_calculation_settings as settings
      where settings.is_applied
      order by settings.updated_at desc
      limit 1
    ),
    0
  );

  if v_prepared.kg_per_package is null or v_prepared.kg_per_package <= 0 then
    return;
  end if;

  v_output_kg :=
    p_raw_input_kg * (1 + coalesce(v_seasoning_ratio, 0) + v_variation);
  v_packs := round((v_output_kg / v_prepared.kg_per_package)::numeric, 0);

  raw_input_kg := p_raw_input_kg;
  raw_meat_item_id := v_raw_id;
  prepared_meat_item_id := v_prepared.id;
  raw_meat_name := v_raw.name;
  prepared_meat_name := v_prepared.name;
  kg_per_package := v_prepared.kg_per_package;
  seasoning_ratio := coalesce(v_seasoning_ratio, 0);
  variation_rate := v_variation;
  expected_output_kg := round(v_output_kg, 3);
  expected_packs := v_packs;
  formula_version := 'raw_plus_seasoning_plus_variation_v1';
  return next;
end;
$$;

revoke all on function public.estimate_prepared_meat_yield(uuid, numeric, uuid)
  from public, anon;
grant execute on function public.estimate_prepared_meat_yield(uuid, numeric, uuid)
  to authenticated, service_role;

comment on function public.estimate_prepared_meat_yield(uuid, numeric, uuid) is
  '預算收成 for 生肉出貨: round(raw_kg × (1 + seasoning_ratio + variation_rate) / kg_per_package). Invoker RLS.';

create or replace function public.record_meat_yield_error_if_needed(
  p_prepared_meat_item_id uuid,
  p_raw_input_kg numeric,
  p_actual_packs numeric,
  p_raw_meat_item_id uuid default null,
  p_production_at timestamptz default now(),
  p_remarks text default null,
  p_prepared_stock_movement_id uuid default null,
  p_source_lots jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  estimate record;
  v_deviation_packs numeric;
  v_deviation_ratio numeric;
  v_direction text;
  v_id uuid;
  v_threshold numeric := 0.10;
begin
  if not (
    private.jwt_app_role() in ('Super Admin', 'Admin', 'Factory')
    or private.has_page_access('frozen.raw_meat_inventory')
  ) then
    raise exception 'not authorized to record meat yield errors'
      using errcode = '42501';
  end if;

  if p_actual_packs is null then
    return jsonb_build_object(
      'recorded', false,
      'reason', 'missing_actual_packs'
    );
  end if;

  select *
  into estimate
  from public.estimate_prepared_meat_yield(
    p_prepared_meat_item_id,
    p_raw_input_kg,
    p_raw_meat_item_id
  );

  if estimate.expected_packs is null or estimate.expected_packs <= 0 then
    return jsonb_build_object(
      'recorded', false,
      'reason', 'expected_unavailable',
      'expected_packs', estimate.expected_packs
    );
  end if;

  v_deviation_packs := p_actual_packs - estimate.expected_packs;
  v_deviation_ratio := v_deviation_packs / estimate.expected_packs;

  if abs(v_deviation_ratio) <= v_threshold then
    return jsonb_build_object(
      'recorded', false,
      'reason', 'within_threshold',
      'expected_packs', estimate.expected_packs,
      'actual_packs', p_actual_packs,
      'deviation_ratio', round(v_deviation_ratio, 6),
      'threshold_ratio', v_threshold
    );
  end if;

  v_direction := case when v_deviation_packs > 0 then 'over' else 'under' end;

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
    remarks,
    recorded_by
  )
  values (
    coalesce(p_production_at, now()),
    estimate.raw_meat_item_id,
    estimate.raw_meat_name,
    estimate.prepared_meat_item_id,
    estimate.prepared_meat_name,
    p_prepared_stock_movement_id,
    estimate.raw_input_kg,
    estimate.kg_per_package,
    estimate.seasoning_ratio,
    estimate.variation_rate,
    estimate.expected_output_kg,
    estimate.expected_packs,
    p_actual_packs,
    case
      when estimate.kg_per_package is null then null
      else round(p_actual_packs * estimate.kg_per_package, 3)
    end,
    v_deviation_packs,
    round(v_deviation_ratio, 6),
    v_direction,
    v_threshold,
    estimate.formula_version,
    coalesce(p_source_lots, '[]'::jsonb),
    nullif(btrim(coalesce(p_remarks, '')), ''),
    (select auth.uid())
  )
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
    remarks = excluded.remarks,
    recorded_by = excluded.recorded_by
  returning id into v_id;

  return jsonb_build_object(
    'recorded', true,
    'reason', 'recorded',
    'id', v_id,
    'expected_packs', estimate.expected_packs,
    'actual_packs', p_actual_packs,
    'deviation_packs', v_deviation_packs,
    'deviation_ratio', round(v_deviation_ratio, 6),
    'deviation_direction', v_direction,
    'threshold_ratio', v_threshold
  );
end;
$$;

revoke all on function public.record_meat_yield_error_if_needed(
  uuid, numeric, numeric, uuid, timestamptz, text, uuid, jsonb
) from public, anon;
grant execute on function public.record_meat_yield_error_if_needed(
  uuid, numeric, numeric, uuid, timestamptz, text, uuid, jsonb
) to authenticated, service_role;

comment on function public.record_meat_yield_error_if_needed(
  uuid, numeric, numeric, uuid, timestamptz, text, uuid, jsonb
) is
  'Inserts 收成錯誤 when actual inbound packs miss 預算收成 by more than 10%. Super Admin, Admin, Factory, or frozen.raw_meat_inventory access.';
