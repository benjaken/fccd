-- Preview remaining raw stock and create prepared-meat inbound that deducts raw meat.

create or replace function public.prepared_meat_inbound_raw_preview(
  p_raw_meat_item_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_remaining numeric(14, 3);
begin
  if not private.has_page_access('frozen.prepared_meat_inventory') then
    raise exception 'not authorized to record prepared meat inbound'
      using errcode = '42501';
  end if;

  if p_raw_meat_item_id is null then
    raise exception 'raw meat item is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.raw_meat_items
    where id = p_raw_meat_item_id
      and archived_at is null
  ) then
    raise exception 'raw meat item not found'
      using errcode = 'P0002';
  end if;

  select coalesce(sum(inbound_quantity_kg), 0) - coalesce(sum(outbound_quantity_kg), 0)
  into v_remaining
  from public.raw_meat_stock_movements
  where raw_meat_item_id = p_raw_meat_item_id;

  return jsonb_build_object(
    'remaining_kg', coalesce(v_remaining, 0),
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'sku', item.sku,
            'name', item.name,
            'unit', item.unit,
            'kg_per_package', item.kg_per_package
          )
          order by item.sort_order nulls last, item.name
        )
        from public.prepared_meat_items as item
        where item.raw_meat_item_id = p_raw_meat_item_id
          and item.archived_at is null
          and item.is_active
          and coalesce(item.kg_per_package, 0) > 0
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.create_prepared_meat_inbound_with_raw(
  p_raw_meat_item_id uuid,
  p_movement_date date,
  p_outbound_kg numeric,
  p_remarks text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw public.raw_meat_items%rowtype;
  v_prepared public.prepared_meat_items%rowtype;
  v_line jsonb;
  v_quantity numeric(14, 3);
  v_budgeted numeric;
  v_min numeric;
  v_max numeric;
  v_remaining numeric(14, 3);
  v_need numeric(14, 3);
  v_take numeric(14, 3);
  v_idx integer;
  v_movement_at timestamptz;
  v_remarks text;
  v_prod_kg numeric;
  v_seasoning_per_kg numeric(14, 4);
  v_lot record;
  v_out_id uuid;
  v_prep_id uuid;
  v_first_id uuid;
  v_raw_ids uuid[] := '{}';
  v_raw_legacies text[] := '{}';
  v_has_line boolean := false;
begin
  if not private.has_page_access('frozen.prepared_meat_inventory') then
    raise exception 'not authorized to record prepared meat inbound'
      using errcode = '42501';
  end if;

  if p_raw_meat_item_id is null then
    raise exception 'raw meat item is required'
      using errcode = '22023';
  end if;

  if p_movement_date is null then
    raise exception 'movement date is required'
      using errcode = '22023';
  end if;

  if p_outbound_kg is null or p_outbound_kg <= 0 then
    raise exception 'quantity must be greater than zero'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'at least one inbound line is required'
      using errcode = '22023';
  end if;

  select *
  into v_raw
  from public.raw_meat_items
  where id = p_raw_meat_item_id
    and archived_at is null;

  if not found then
    raise exception 'raw meat item not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.raw_meat_stock_movements
  where raw_meat_item_id = v_raw.id
  for update;

  select coalesce(sum(inbound_quantity_kg), 0) - coalesce(sum(outbound_quantity_kg), 0)
  into v_remaining
  from public.raw_meat_stock_movements
  where raw_meat_item_id = v_raw.id;

  if p_outbound_kg > coalesce(v_remaining, 0) then
    raise exception 'quantity exceeds current stock'
      using errcode = '22023';
  end if;

  for v_line in
    select value
    from jsonb_array_elements(p_lines)
  loop
    v_quantity := (v_line ->> 'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 then
      continue;
    end if;

    if v_quantity <> trunc(v_quantity) then
      raise exception 'inbound quantity must be a whole number'
        using errcode = '22023';
    end if;

    select *
    into v_prepared
    from public.prepared_meat_items
    where id = nullif(v_line ->> 'prepared_meat_item_id', '')::uuid
      and archived_at is null;

    if not found then
      raise exception 'prepared meat item not found'
        using errcode = 'P0002';
    end if;

    if v_prepared.raw_meat_item_id is distinct from v_raw.id then
      raise exception 'prepared meat item does not match selected raw meat'
        using errcode = '22023';
    end if;

    if coalesce(v_prepared.kg_per_package, 0) <= 0 then
      raise exception 'kg per package must be greater than zero'
        using errcode = '22023';
    end if;

    v_budgeted := round(p_outbound_kg / v_prepared.kg_per_package);
    v_min := round(v_budgeted * 0.5);
    v_max := round(v_budgeted * 1.5);

    if v_quantity < v_min or v_quantity > v_max then
      raise exception 'inbound quantity must be within 50 percent of budgeted yield'
        using errcode = '22023';
    end if;

    v_has_line := true;
  end loop;

  if not v_has_line then
    raise exception 'at least one inbound line is required'
      using errcode = '22023';
  end if;

  v_movement_at := (p_movement_date::timestamp at time zone 'Asia/Hong_Kong');
  v_remarks := nullif(btrim(coalesce(p_remarks, '')), '');
  v_need := round(p_outbound_kg, 3);

  select max(production_raw_meat_kg)
  into v_prod_kg
  from public.meat_seasoning_cost_versions
  where raw_meat_item_id = v_raw.id
    and is_applied;

  if v_raw.current_seasoning_cost is null then
    v_seasoning_per_kg := null;
  elsif v_prod_kg is null or v_prod_kg = 0 then
    v_seasoning_per_kg := v_raw.current_seasoning_cost;
  else
    v_seasoning_per_kg := round(v_raw.current_seasoning_cost / v_prod_kg, 4);
  end if;

  for v_lot in
    select
      inbound.id,
      inbound.legacy_id,
      greatest(
        coalesce(inbound.inbound_quantity_kg, 0)
        - coalesce(
          (
            select sum(outb.outbound_quantity_kg)
            from public.raw_meat_stock_relations as rel
            join public.raw_meat_stock_movements as outb
              on outb.id = rel.movement_id
            where rel.inbound_movement_id = inbound.id
          ),
          0
        ),
        0
      ) as remaining
    from public.raw_meat_stock_movements as inbound
    where inbound.raw_meat_item_id = v_raw.id
      and coalesce(inbound.inbound_quantity_kg, 0) > 0
    order by inbound.movement_at nulls last, inbound.created_at, inbound.id
  loop
    exit when v_need <= 0;
    continue when v_lot.remaining <= 0;
    v_take := least(v_need, v_lot.remaining);

    insert into public.raw_meat_stock_movements (
      legacy_id,
      raw_meat_item_id,
      raw_meat_item_legacy_id,
      movement_at,
      outbound_quantity_kg,
      allocated_inbound_quantity_kg,
      applied_seasoning_cost,
      applied_seasoning_code,
      applied_markup_rate,
      applied_variation_rate,
      applied_seasoning_per_kg,
      remarks,
      bubble_created_at,
      bubble_modified_at
    )
    values (
      'web-prep-raw-out-' || gen_random_uuid()::text,
      v_raw.id,
      v_raw.legacy_id,
      v_movement_at,
      v_take,
      v_take,
      v_raw.current_seasoning_cost,
      v_raw.current_seasoning_code,
      v_raw.current_markup_rate,
      v_raw.current_variation_rate,
      v_seasoning_per_kg,
      v_remarks,
      now(),
      now()
    )
    returning id into v_out_id;

    insert into public.raw_meat_stock_relations (
      movement_id,
      movement_legacy_id,
      inbound_movement_id,
      inbound_movement_legacy_id
    )
    values (
      v_out_id,
      (select legacy_id from public.raw_meat_stock_movements where id = v_out_id),
      v_lot.id,
      v_lot.legacy_id
    );

    v_raw_ids := array_append(v_raw_ids, v_out_id);
    v_raw_legacies := array_append(
      v_raw_legacies,
      (select legacy_id from public.raw_meat_stock_movements where id = v_out_id)
    );
    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    insert into public.raw_meat_stock_movements (
      legacy_id,
      raw_meat_item_id,
      raw_meat_item_legacy_id,
      movement_at,
      outbound_quantity_kg,
      applied_seasoning_cost,
      applied_seasoning_code,
      applied_markup_rate,
      applied_variation_rate,
      applied_seasoning_per_kg,
      remarks,
      bubble_created_at,
      bubble_modified_at
    )
    values (
      'web-prep-raw-out-' || gen_random_uuid()::text,
      v_raw.id,
      v_raw.legacy_id,
      v_movement_at,
      v_need,
      v_raw.current_seasoning_cost,
      v_raw.current_seasoning_code,
      v_raw.current_markup_rate,
      v_raw.current_variation_rate,
      v_seasoning_per_kg,
      v_remarks,
      now(),
      now()
    )
    returning id into v_out_id;

    v_raw_ids := array_append(v_raw_ids, v_out_id);
    v_raw_legacies := array_append(
      v_raw_legacies,
      (select legacy_id from public.raw_meat_stock_movements where id = v_out_id)
    );
    v_need := 0;
  end if;

  if coalesce(array_length(v_raw_ids, 1), 0) = 0 then
    raise exception 'quantity exceeds current stock'
      using errcode = '22023';
  end if;

  for v_line in
    select value
    from jsonb_array_elements(p_lines)
  loop
    v_quantity := (v_line ->> 'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 then
      continue;
    end if;

    select *
    into v_prepared
    from public.prepared_meat_items
    where id = nullif(v_line ->> 'prepared_meat_item_id', '')::uuid;

    insert into public.prepared_meat_stock_movements (
      legacy_id,
      prepared_meat_item_id,
      prepared_meat_item_legacy_id,
      movement_at,
      inbound_packages,
      remarks,
      bubble_created_at,
      bubble_modified_at
    )
    values (
      'web-prep-in-' || gen_random_uuid()::text,
      v_prepared.id,
      v_prepared.legacy_id,
      v_movement_at,
      v_quantity,
      v_remarks,
      now(),
      now()
    )
    returning id into v_prep_id;

    if v_first_id is null then
      v_first_id := v_prep_id;
    end if;

    for v_idx in 1 .. array_length(v_raw_ids, 1)
    loop
      insert into public.prepared_meat_stock_raw_sources (
        prepared_movement_id,
        prepared_movement_legacy_id,
        raw_stock_movement_id,
        raw_stock_movement_legacy_id
      )
      values (
        v_prep_id,
        (select legacy_id from public.prepared_meat_stock_movements where id = v_prep_id),
        v_raw_ids[v_idx],
        v_raw_legacies[v_idx]
      );
    end loop;
  end loop;

  return v_first_id;
end;
$$;

revoke all on function public.prepared_meat_inbound_raw_preview(uuid) from public;
grant execute on function public.prepared_meat_inbound_raw_preview(uuid) to authenticated;

revoke all on function public.create_prepared_meat_inbound_with_raw(
  uuid, date, numeric, text, jsonb
) from public;
grant execute on function public.create_prepared_meat_inbound_with_raw(
  uuid, date, numeric, text, jsonb
) to authenticated;

comment on function public.prepared_meat_inbound_raw_preview(uuid) is
  'Returns remaining raw kg and matching prepared items for 製成品入貨(扣原料).';

comment on function public.create_prepared_meat_inbound_with_raw(
  uuid, date, numeric, text, jsonb
) is
  'Creates prepared inbound packages and deducts raw meat stock without per-lot remaining UI.';
