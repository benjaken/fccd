-- Create a prepared meat option from the 製成品存貨計算 heading action.

create or replace function public.create_prepared_meat_item(
  p_name text,
  p_english_name text,
  p_sku text,
  p_unit text,
  p_kg_per_package numeric,
  p_raw_meat_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_next_sort numeric;
  v_raw_id uuid;
  v_raw_legacy text;
  v_kg numeric(14, 3);
begin
  if not private.has_page_access('frozen.prepared_meat_inventory') then
    raise exception 'not authorized to create prepared meat options'
      using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'prepared meat name is required'
      using errcode = '22023';
  end if;

  v_kg := p_kg_per_package;
  if v_kg is not null and v_kg <= 0 then
    raise exception 'kg per package must be greater than zero'
      using errcode = '22023';
  end if;

  if p_raw_meat_item_id is not null then
    select id, legacy_id
    into v_raw_id, v_raw_legacy
    from public.raw_meat_items
    where id = p_raw_meat_item_id
      and archived_at is null;

    if not found then
      raise exception 'raw meat item not found'
        using errcode = 'P0002';
    end if;
  end if;

  select coalesce(max(sort_order), 0) + 1
  into v_next_sort
  from public.prepared_meat_items
  where archived_at is null;

  insert into public.prepared_meat_items (
    legacy_id,
    raw_meat_item_id,
    raw_meat_item_legacy_id,
    sku,
    name,
    english_name,
    unit,
    kg_per_package,
    sort_order,
    is_active,
    bubble_created_at,
    bubble_modified_at
  )
  values (
    'web-prep-item-' || gen_random_uuid()::text,
    v_raw_id,
    v_raw_legacy,
    nullif(btrim(coalesce(p_sku, '')), ''),
    v_name,
    nullif(btrim(coalesce(p_english_name, '')), ''),
    nullif(btrim(coalesce(p_unit, '')), ''),
    v_kg,
    v_next_sort,
    true,
    now(),
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_prepared_meat_item(
  text, text, text, text, numeric, uuid
) from public;
grant execute on function public.create_prepared_meat_item(
  text, text, text, text, numeric, uuid
) to authenticated;

comment on function public.create_prepared_meat_item(
  text, text, text, text, numeric, uuid
) is
  'Creates a prepared meat option for roles that can open 製成品存貨計算.';
