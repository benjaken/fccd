-- Delete a meat-stock ledger entry as one transaction. Production converts raw
-- stock into prepared stock, so deleting either side must reverse both sides.

create or replace function public.delete_meat_stock_movement(
  p_movement_type text,
  p_movement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_ids uuid[] := '{}'::uuid[];
  v_prepared_ids uuid[] := '{}'::uuid[];
  v_order_ids uuid[] := '{}'::uuid[];
  v_previous_size integer := -1;
  v_raw_count integer := 0;
  v_prepared_count integer := 0;
begin
  if not (
    private.has_page_access('frozen.raw_meat_inventory.edit')
    or private.has_page_access('frozen.prepared_meat_inventory')
  ) then
    raise exception 'not authorized to delete meat stock movements'
      using errcode = '42501';
  end if;

  if p_movement_type = 'raw' then
    if not exists (
      select 1 from public.raw_meat_stock_movements where id = p_movement_id
    ) then
      raise exception 'raw meat movement not found' using errcode = 'P0002';
    end if;
    v_raw_ids := array[p_movement_id];
  elsif p_movement_type = 'prepared' then
    if not exists (
      select 1 from public.prepared_meat_stock_movements where id = p_movement_id
    ) then
      raise exception 'prepared meat movement not found' using errcode = 'P0002';
    end if;
    v_prepared_ids := array[p_movement_id];
  else
    raise exception 'invalid meat movement type' using errcode = '22023';
  end if;

  -- Expand the transaction group until no additional linked rows are found.
  -- A prepared production row can share several raw FIFO movements and several
  -- prepared rows can belong to the same conversion, hence the fixed-point loop.
  while v_previous_size <> cardinality(v_raw_ids) + cardinality(v_prepared_ids)
  loop
    v_previous_size := cardinality(v_raw_ids) + cardinality(v_prepared_ids);

    select coalesce(array_agg(distinct id), '{}'::uuid[])
    into v_raw_ids
    from (
      select unnest(v_raw_ids) as id
      union
      select source.raw_stock_movement_id
      from public.prepared_meat_stock_raw_sources as source
      where source.prepared_movement_id = any(v_prepared_ids)
        and source.raw_stock_movement_id is not null
      union
      -- If an inbound lot itself is removed, remove movements allocated from
      -- that lot as dependants rather than leaving broken FIFO allocations.
      select relation.movement_id
      from public.raw_meat_stock_relations as relation
      where relation.inbound_movement_id = any(v_raw_ids)
    ) as linked_raw;

    select coalesce(array_agg(distinct id), '{}'::uuid[])
    into v_prepared_ids
    from (
      select unnest(v_prepared_ids) as id
      union
      select source.prepared_movement_id
      from public.prepared_meat_stock_raw_sources as source
      where source.raw_stock_movement_id = any(v_raw_ids)
    ) as linked_prepared;
  end loop;

  -- Stock rows created by a delivery note are one document-level transaction.
  -- Removing any one of them therefore reverses that complete delivery note.
  select coalesce(array_agg(distinct line.meat_order_id), '{}'::uuid[])
  into v_order_ids
  from public.meat_order_lines as line
  where line.id in (
    select movement.meat_order_line_id
    from public.raw_meat_stock_movements as movement
    where movement.id = any(v_raw_ids)
    union
    select movement.meat_order_line_id
    from public.prepared_meat_stock_movements as movement
    where movement.id = any(v_prepared_ids)
  )
  and line.meat_order_id is not null;

  if cardinality(v_order_ids) > 0 then
    select coalesce(array_agg(distinct id), '{}'::uuid[])
    into v_raw_ids
    from (
      select unnest(v_raw_ids) as id
      union
      select movement.id
      from public.raw_meat_stock_movements as movement
      join public.meat_order_lines as line on line.id = movement.meat_order_line_id
      where line.meat_order_id = any(v_order_ids)
    ) as order_raw;

    select coalesce(array_agg(distinct id), '{}'::uuid[])
    into v_prepared_ids
    from (
      select unnest(v_prepared_ids) as id
      union
      select movement.id
      from public.prepared_meat_stock_movements as movement
      join public.meat_order_lines as line on line.id = movement.meat_order_line_id
      where line.meat_order_id = any(v_order_ids)
    ) as order_prepared;
  end if;

  v_raw_count := cardinality(v_raw_ids);
  v_prepared_count := cardinality(v_prepared_ids);

  delete from public.prepared_meat_stock_raw_sources
  where prepared_movement_id = any(v_prepared_ids)
     or raw_stock_movement_id = any(v_raw_ids);

  delete from public.meat_yield_errors
  where prepared_stock_movement_id = any(v_prepared_ids);

  delete from public.raw_meat_stock_relations
  where movement_id = any(v_raw_ids)
     or inbound_movement_id = any(v_raw_ids);

  delete from public.prepared_meat_stock_movements
  where id = any(v_prepared_ids);

  delete from public.raw_meat_stock_movements
  where id = any(v_raw_ids);

  if cardinality(v_order_ids) > 0 then
    delete from public.meat_order_lines where meat_order_id = any(v_order_ids);
    delete from public.meat_orders where id = any(v_order_ids);
  end if;

  return jsonb_build_object(
    'raw_deleted', v_raw_count,
    'prepared_deleted', v_prepared_count,
    'orders_deleted', cardinality(v_order_ids)
  );
end;
$$;

revoke all on function public.delete_meat_stock_movement(text, uuid) from public;
grant execute on function public.delete_meat_stock_movement(text, uuid) to authenticated;

comment on function public.delete_meat_stock_movement(text, uuid) is
  'Deletes a raw/prepared stock transaction and reverses all linked inventory movements.';
