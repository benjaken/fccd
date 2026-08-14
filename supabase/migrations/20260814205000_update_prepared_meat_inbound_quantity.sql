-- Edit prepared-meat inbound packages from the inventory ledger.
-- Inbound that deducted raw meat re-runs budgeted-yield ±50% and records 收成異常.
-- Inbound without raw sources only updates the pack count.

create or replace function private.prepared_meat_budgeted_yield_packs(
  p_prepared_meat_item_id uuid,
  p_outbound_kg numeric,
  p_kg_per_package numeric,
  p_exclude_movement_id uuid
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
            and (
              p_exclude_movement_id is null
              or prep.id is distinct from p_exclude_movement_id
            )
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
            and (
              p_exclude_movement_id is null
              or prep.id is distinct from p_exclude_movement_id
            )
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

create or replace function private.prepared_meat_inbound_raw_input(p_movement_id uuid)
returns table(raw_input_kg numeric, raw_meat_item_id uuid)
language sql
stable
set search_path = public
as $$
  select
    coalesce(sum(raw.outbound_quantity_kg), 0)::numeric as raw_input_kg,
    (
      array_agg(raw.raw_meat_item_id order by raw.created_at, raw.id)
    )[1] as raw_meat_item_id
  from public.prepared_meat_stock_raw_sources as src
  join public.raw_meat_stock_movements as raw
    on raw.id = src.raw_stock_movement_id
  where src.prepared_movement_id = p_movement_id;
$$;

create or replace function private.sync_prepared_meat_yield_error(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement public.prepared_meat_stock_movements%rowtype;
  v_raw_kg numeric := 0;
  v_raw_id uuid;
begin
  if p_movement_id is null then
    return;
  end if;

  select *
  into v_movement
  from public.prepared_meat_stock_movements
  where id = p_movement_id;

  if not found then
    return;
  end if;

  delete from public.meat_yield_errors
  where prepared_stock_movement_id = p_movement_id;

  if coalesce(v_movement.inbound_packages, 0) <= 0 then
    return;
  end if;

  select raw_input.raw_input_kg, raw_input.raw_meat_item_id
  into v_raw_kg, v_raw_id
  from private.prepared_meat_inbound_raw_input(p_movement_id) as raw_input;

  if coalesce(v_raw_kg, 0) <= 0 then
    return;
  end if;

  begin
    perform public.record_meat_yield_error_if_needed(
      v_movement.prepared_meat_item_id,
      v_raw_kg,
      v_movement.inbound_packages,
      v_raw_id,
      v_movement.movement_at,
      v_movement.remarks,
      p_movement_id,
      '[]'::jsonb
    );
  exception
    when others then
      raise warning 'prepared meat yield error sync failed for %: %', p_movement_id, sqlerrm;
  end;
end;
$$;

create or replace function private.trg_sync_yield_error_from_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.inbound_packages is not distinct from old.inbound_packages then
    return new;
  end if;
  perform private.sync_prepared_meat_yield_error(new.id);
  return new;
end;
$$;

create or replace function private.trg_sync_yield_error_from_raw_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.sync_prepared_meat_yield_error(new.prepared_movement_id);
  return new;
end;
$$;

drop trigger if exists trg_sync_yield_error_from_inbound
  on public.prepared_meat_stock_movements;
create trigger trg_sync_yield_error_from_inbound
after update of inbound_packages
on public.prepared_meat_stock_movements
for each row
execute function private.trg_sync_yield_error_from_inbound();

drop trigger if exists trg_sync_yield_error_from_raw_source
  on public.prepared_meat_stock_raw_sources;
create trigger trg_sync_yield_error_from_raw_source
after insert
on public.prepared_meat_stock_raw_sources
for each row
execute function private.trg_sync_yield_error_from_raw_source();

create or replace function public.prepared_meat_inbound_edit_preview(p_movement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_movement public.prepared_meat_stock_movements%rowtype;
  v_item public.prepared_meat_items%rowtype;
  v_raw_kg numeric := 0;
  v_raw_id uuid;
  v_requires_raw boolean := false;
  v_budgeted numeric := 0;
begin
  if not private.has_page_access('frozen.prepared_meat_inventory') then
    raise exception 'not authorized to edit prepared meat inbound'
      using errcode = '42501';
  end if;

  if p_movement_id is null then
    raise exception 'inbound movement not found'
      using errcode = 'P0002';
  end if;

  select *
  into v_movement
  from public.prepared_meat_stock_movements
  where id = p_movement_id;

  if not found or coalesce(v_movement.inbound_packages, 0) <= 0 then
    raise exception 'inbound movement not found'
      using errcode = 'P0002';
  end if;

  select *
  into v_item
  from public.prepared_meat_items
  where id = v_movement.prepared_meat_item_id;

  if not found then
    raise exception 'prepared meat item not found'
      using errcode = 'P0002';
  end if;

  select raw_input.raw_input_kg, raw_input.raw_meat_item_id
  into v_raw_kg, v_raw_id
  from private.prepared_meat_inbound_raw_input(p_movement_id) as raw_input;

  v_requires_raw :=
    coalesce(v_raw_kg, 0) > 0
    or v_item.raw_meat_item_id is not null;

  if coalesce(v_raw_kg, 0) > 0 then
    v_budgeted := private.prepared_meat_budgeted_yield_packs(
      v_item.id,
      v_raw_kg,
      v_item.kg_per_package,
      v_movement.id
    );
  end if;

  return jsonb_build_object(
    'id', v_movement.id,
    'product_name', v_item.name,
    'inbound_packages', v_movement.inbound_packages,
    'requires_raw', v_requires_raw,
    'raw_input_kg', coalesce(v_raw_kg, 0),
    'raw_meat_item_id', v_raw_id,
    'budgeted_packs', coalesce(v_budgeted, 0),
    'min_packs', round(greatest(coalesce(v_budgeted, 0), 0) * 0.5),
    'max_packs', round(greatest(coalesce(v_budgeted, 0), 0) * 1.5)
  );
end;
$$;

create or replace function public.update_prepared_meat_inbound_quantity(
  p_movement_id uuid,
  p_quantity numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement public.prepared_meat_stock_movements%rowtype;
  v_item public.prepared_meat_items%rowtype;
  v_raw_kg numeric := 0;
  v_requires_raw boolean := false;
  v_budgeted numeric := 0;
  v_min numeric := 0;
  v_max numeric := 0;
begin
  if not private.has_page_access('frozen.prepared_meat_inventory') then
    raise exception 'not authorized to edit prepared meat inbound'
      using errcode = '42501';
  end if;

  if p_movement_id is null then
    raise exception 'inbound movement not found'
      using errcode = 'P0002';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity <> trunc(p_quantity) then
    raise exception 'inbound quantity must be a whole number'
      using errcode = '22023';
  end if;

  select *
  into v_movement
  from public.prepared_meat_stock_movements
  where id = p_movement_id
  for update;

  if not found or coalesce(v_movement.inbound_packages, 0) <= 0 then
    raise exception 'inbound movement not found'
      using errcode = 'P0002';
  end if;

  select *
  into v_item
  from public.prepared_meat_items
  where id = v_movement.prepared_meat_item_id;

  if not found then
    raise exception 'prepared meat item not found'
      using errcode = 'P0002';
  end if;

  select raw_input.raw_input_kg
  into v_raw_kg
  from private.prepared_meat_inbound_raw_input(p_movement_id) as raw_input;

  v_requires_raw :=
    coalesce(v_raw_kg, 0) > 0
    or v_item.raw_meat_item_id is not null;

  if v_requires_raw and coalesce(v_raw_kg, 0) > 0 then
    v_budgeted := private.prepared_meat_budgeted_yield_packs(
      v_item.id,
      v_raw_kg,
      v_item.kg_per_package,
      v_movement.id
    );
    if coalesce(v_budgeted, 0) > 0 then
      v_min := round(v_budgeted * 0.5);
      v_max := round(v_budgeted * 1.5);
      if p_quantity < v_min or p_quantity > v_max then
        raise exception 'inbound quantity must be within 50 percent of budgeted yield'
          using errcode = '22023';
      end if;
    end if;
  end if;

  update public.prepared_meat_stock_movements
  set
    inbound_packages = p_quantity,
    bubble_modified_at = now()
  where id = p_movement_id;

  return p_movement_id;
end;
$$;

revoke all on function public.prepared_meat_inbound_edit_preview(uuid) from public;
grant execute on function public.prepared_meat_inbound_edit_preview(uuid) to authenticated;

revoke all on function public.update_prepared_meat_inbound_quantity(uuid, numeric)
  from public;
grant execute on function public.update_prepared_meat_inbound_quantity(uuid, numeric)
  to authenticated;

comment on function public.prepared_meat_inbound_edit_preview(uuid) is
  'Loads inbound pack quantity and budgeted-yield bounds for ledger edit.';

comment on function public.update_prepared_meat_inbound_quantity(uuid, numeric) is
  'Updates inbound packages. Raw-linked inbound must stay within ±50% of budgeted yield and records 收成異常.';
