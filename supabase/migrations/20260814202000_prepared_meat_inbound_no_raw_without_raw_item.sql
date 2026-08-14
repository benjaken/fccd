-- 製成品入貨(無原料) only accepts items that are not linked to raw meat.

create or replace function public.create_prepared_meat_inbound_no_raw(
  p_movement_date date,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_item public.prepared_meat_items%rowtype;
  v_item_id uuid;
  v_quantity numeric(14, 3);
  v_movement_at timestamptz;
  v_first_id uuid;
  v_id uuid;
begin
  if not private.has_page_access('frozen.prepared_meat_inventory') then
    raise exception 'not authorized to record prepared meat inbound'
      using errcode = '42501';
  end if;

  if p_movement_date is null then
    raise exception 'movement date is required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one inbound line is required'
      using errcode = '22023';
  end if;

  v_movement_at := (p_movement_date::timestamp at time zone 'Asia/Hong_Kong');

  for v_line in
    select value
    from jsonb_array_elements(p_lines)
  loop
    v_item_id := nullif(v_line ->> 'prepared_meat_item_id', '')::uuid;
    v_quantity := (v_line ->> 'quantity')::numeric;

    if v_item_id is null then
      raise exception 'prepared meat item is required'
        using errcode = '22023';
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'quantity must be greater than zero'
        using errcode = '22023';
    end if;

    select *
    into v_item
    from public.prepared_meat_items
    where id = v_item_id
      and archived_at is null;

    if not found then
      raise exception 'prepared meat item not found'
        using errcode = 'P0002';
    end if;

    if v_item.raw_meat_item_id is not null then
      raise exception 'prepared meat item requires raw meat'
        using errcode = '22023';
    end if;

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
      v_item.id,
      v_item.legacy_id,
      v_movement_at,
      v_quantity,
      nullif(btrim(coalesce(v_line ->> 'remarks', '')), ''),
      now(),
      now()
    )
    returning id into v_id;

    if v_first_id is null then
      v_first_id := v_id;
    end if;
  end loop;

  return v_first_id;
end;
$$;

revoke all on function public.create_prepared_meat_inbound_no_raw(date, jsonb)
  from public;
grant execute on function public.create_prepared_meat_inbound_no_raw(date, jsonb)
  to authenticated;

comment on function public.create_prepared_meat_inbound_no_raw(date, jsonb) is
  'Creates prepared-meat inbound movements without raw-source deductions. Only items with no linked raw meat are allowed.';
