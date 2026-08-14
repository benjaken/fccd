-- Current on-hand stock for outbound quantity checks, plus save-time enforcement.

create or replace function public.prepared_meat_outbound_stock_balances()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.has_page_access('frozen.prepared_meat_inventory') then
    raise exception 'not authorized to read prepared meat stock'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'prepared',
    coalesce(
      (
        select jsonb_object_agg(item_id, stock)
        from (
          select
            prepared_meat_item_id::text as item_id,
            coalesce(sum(inbound_packages), 0) - coalesce(sum(outbound_packages), 0) as stock
          from public.prepared_meat_stock_movements
          group by prepared_meat_item_id
        ) as prepared_stock
      ),
      '{}'::jsonb
    ),
    'raw',
    coalesce(
      (
        select jsonb_object_agg(item_id, stock)
        from (
          select
            raw_meat_item_id::text as item_id,
            coalesce(sum(inbound_quantity_kg), 0) - coalesce(sum(outbound_quantity_kg), 0) as stock
          from public.raw_meat_stock_movements
          group by raw_meat_item_id
        ) as raw_stock
      ),
      '{}'::jsonb
    )
  );
end;
$$;

revoke all on function public.prepared_meat_outbound_stock_balances() from public;
grant execute on function public.prepared_meat_outbound_stock_balances() to authenticated;

comment on function public.prepared_meat_outbound_stock_balances() is
  'Returns current prepared-meat package and raw-meat kg on-hand balances for outbound checks.';

create or replace function public.save_prepared_meat_outbound(
  p_order_id uuid,
  p_customer_id uuid,
  p_shipping_method_id uuid,
  p_order_number text,
  p_shipping_date date,
  p_remarks text,
  p_contact_person text,
  p_phone text,
  p_address text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.meat_customers%rowtype;
  v_method_id uuid;
  v_method_legacy text;
  v_order_id uuid;
  v_shipping_at timestamptz;
  v_line jsonb;
  v_prepared public.prepared_meat_items%rowtype;
  v_raw public.raw_meat_items%rowtype;
  v_prepared_id uuid;
  v_raw_id uuid;
  v_quantity numeric(14, 3);
  v_sort numeric := 0;
  v_line_id uuid;
  v_allow_raw boolean := false;
  v_existing public.meat_orders%rowtype;
  v_stock numeric := 0;
begin
  if not private.has_page_access('frozen.prepared_meat_inventory') then
    raise exception 'not authorized to save prepared meat outbound'
      using errcode = '42501';
  end if;

  if p_customer_id is null then
    raise exception 'customer is required'
      using errcode = '22023';
  end if;

  if p_shipping_date is null then
    raise exception 'shipping date is required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one outbound line is required'
      using errcode = '22023';
  end if;

  select *
  into v_customer
  from public.meat_customers
  where id = p_customer_id
    and archived_at is null;

  if not found then
    raise exception 'meat customer not found'
      using errcode = 'P0002';
  end if;

  v_allow_raw :=
    position('到會' in coalesce(v_customer.name, '')) > 0
    or position('凍肉製作' in coalesce(v_customer.name, '')) > 0;

  if p_shipping_method_id is not null
    and position('桂花小幸' in coalesce(v_customer.name, '')) = 0 then
    raise exception 'shipping method is only allowed for 桂花小幸'
      using errcode = '22023';
  end if;

  if p_shipping_method_id is not null then
    select id, legacy_id
    into v_method_id, v_method_legacy
    from public.meat_shipping_methods
    where id = p_shipping_method_id
      and archived_at is null;

    if not found then
      raise exception 'shipping method not found'
        using errcode = 'P0002';
    end if;
  end if;

  update public.meat_customers
  set
    contact_person = nullif(btrim(coalesce(p_contact_person, '')), ''),
    phone = nullif(btrim(coalesce(p_phone, '')), ''),
    address = nullif(btrim(coalesce(p_address, '')), ''),
    bubble_modified_at = now(),
    updated_at = now()
  where id = v_customer.id;

  v_shipping_at := (p_shipping_date::timestamp at time zone 'Asia/Hong_Kong');

  if p_order_id is not null then
    select *
    into v_existing
    from public.meat_orders
    where id = p_order_id;

    if not found then
      raise exception 'meat order not found'
        using errcode = 'P0002';
    end if;

    delete from public.prepared_meat_stock_raw_sources
    where prepared_movement_id in (
      select movement.id
      from public.prepared_meat_stock_movements as movement
      join public.meat_order_lines as line
        on line.id = movement.meat_order_line_id
      where line.meat_order_id = p_order_id
    )
    or raw_stock_movement_id in (
      select movement.id
      from public.raw_meat_stock_movements as movement
      join public.meat_order_lines as line
        on line.id = movement.meat_order_line_id
      where line.meat_order_id = p_order_id
    );

    delete from public.meat_yield_errors
    where prepared_stock_movement_id in (
      select movement.id
      from public.prepared_meat_stock_movements as movement
      join public.meat_order_lines as line
        on line.id = movement.meat_order_line_id
      where line.meat_order_id = p_order_id
    );

    delete from public.raw_meat_stock_relations
    where movement_id in (
      select movement.id
      from public.raw_meat_stock_movements as movement
      join public.meat_order_lines as line
        on line.id = movement.meat_order_line_id
      where line.meat_order_id = p_order_id
    )
    or inbound_movement_id in (
      select movement.id
      from public.raw_meat_stock_movements as movement
      join public.meat_order_lines as line
        on line.id = movement.meat_order_line_id
      where line.meat_order_id = p_order_id
    );

    delete from public.prepared_meat_stock_movements
    where meat_order_line_id in (
      select id from public.meat_order_lines where meat_order_id = p_order_id
    );

    delete from public.raw_meat_stock_movements
    where meat_order_line_id in (
      select id from public.meat_order_lines where meat_order_id = p_order_id
    );

    delete from public.meat_order_lines
    where meat_order_id = p_order_id;

    update public.meat_orders
    set
      meat_customer_id = v_customer.id,
      meat_customer_legacy_id = v_customer.legacy_id,
      shipping_method_id = v_method_id,
      shipping_method_legacy_id = v_method_legacy,
      order_number = nullif(btrim(coalesce(p_order_number, '')), ''),
      order_at = v_shipping_at,
      shipping_at = v_shipping_at,
      remarks = nullif(btrim(coalesce(p_remarks, '')), ''),
      bubble_modified_at = now(),
      updated_at = now()
    where id = p_order_id;

    v_order_id := p_order_id;
  else
    insert into public.meat_orders (
      legacy_id,
      meat_customer_id,
      meat_customer_legacy_id,
      shipping_method_id,
      shipping_method_legacy_id,
      order_number,
      order_at,
      shipping_at,
      send_to_factory,
      remarks,
      sent_at,
      bubble_created_at,
      bubble_modified_at
    )
    values (
      'web-prep-order-' || gen_random_uuid()::text,
      v_customer.id,
      v_customer.legacy_id,
      v_method_id,
      v_method_legacy,
      nullif(btrim(coalesce(p_order_number, '')), ''),
      v_shipping_at,
      v_shipping_at,
      false,
      nullif(btrim(coalesce(p_remarks, '')), ''),
      null,
      now(),
      now()
    )
    returning id into v_order_id;
  end if;

  for v_line in
    select value
    from jsonb_array_elements(p_lines)
  loop
    v_sort := v_sort + 1;
    v_quantity := (v_line ->> 'quantity')::numeric;
    v_prepared_id := nullif(v_line ->> 'prepared_meat_item_id', '')::uuid;
    v_raw_id := nullif(v_line ->> 'raw_meat_item_id', '')::uuid;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'quantity must be greater than zero'
        using errcode = '22023';
    end if;

    if (v_prepared_id is null) = (v_raw_id is null) then
      raise exception 'each line must be either prepared meat or raw meat'
        using errcode = '22023';
    end if;

    if v_raw_id is not null then
      if not v_allow_raw then
        raise exception 'raw meat is only allowed for 到會 and 凍肉製作'
          using errcode = '22023';
      end if;

      select *
      into v_raw
      from public.raw_meat_items
      where id = v_raw_id
        and archived_at is null
        and is_active
        and can_ship_directly;

      if not found then
        raise exception 'raw meat item not found or cannot ship directly'
          using errcode = 'P0002';
      end if;

      select coalesce(sum(inbound_quantity_kg), 0) - coalesce(sum(outbound_quantity_kg), 0)
      into v_stock
      from public.raw_meat_stock_movements
      where raw_meat_item_id = v_raw.id;

      if v_quantity > coalesce(v_stock, 0) then
        raise exception 'quantity exceeds current stock'
          using errcode = '22023';
      end if;

      insert into public.meat_order_lines (
        legacy_id,
        meat_order_id,
        meat_order_legacy_id,
        raw_meat_item_id,
        raw_meat_item_legacy_id,
        quantity,
        sort_order,
        remarks,
        bubble_created_at,
        bubble_modified_at
      )
      values (
        'web-prep-line-' || gen_random_uuid()::text,
        v_order_id,
        (select legacy_id from public.meat_orders where id = v_order_id),
        v_raw.id,
        v_raw.legacy_id,
        v_quantity,
        v_sort,
        nullif(btrim(coalesce(v_line ->> 'remarks', '')), ''),
        now(),
        now()
      )
      returning id into v_line_id;

      insert into public.raw_meat_stock_movements (
        legacy_id,
        raw_meat_item_id,
        raw_meat_item_legacy_id,
        meat_order_line_id,
        meat_order_line_legacy_id,
        movement_at,
        outbound_quantity_kg,
        remarks,
        bubble_created_at,
        bubble_modified_at
      )
      values (
        'web-prep-stock-' || gen_random_uuid()::text,
        v_raw.id,
        v_raw.legacy_id,
        v_line_id,
        (select legacy_id from public.meat_order_lines where id = v_line_id),
        v_shipping_at,
        v_quantity,
        nullif(btrim(coalesce(v_line ->> 'remarks', '')), ''),
        now(),
        now()
      );
    else
      select *
      into v_prepared
      from public.prepared_meat_items
      where id = v_prepared_id
        and archived_at is null;

      if not found then
        raise exception 'prepared meat item not found'
          using errcode = 'P0002';
      end if;

      select coalesce(sum(inbound_packages), 0) - coalesce(sum(outbound_packages), 0)
      into v_stock
      from public.prepared_meat_stock_movements
      where prepared_meat_item_id = v_prepared.id;

      if v_quantity > coalesce(v_stock, 0) then
        raise exception 'quantity exceeds current stock'
          using errcode = '22023';
      end if;

      insert into public.meat_order_lines (
        legacy_id,
        meat_order_id,
        meat_order_legacy_id,
        prepared_meat_item_id,
        prepared_meat_item_legacy_id,
        quantity,
        sort_order,
        remarks,
        bubble_created_at,
        bubble_modified_at
      )
      values (
        'web-prep-line-' || gen_random_uuid()::text,
        v_order_id,
        (select legacy_id from public.meat_orders where id = v_order_id),
        v_prepared.id,
        v_prepared.legacy_id,
        v_quantity,
        v_sort,
        nullif(btrim(coalesce(v_line ->> 'remarks', '')), ''),
        now(),
        now()
      )
      returning id into v_line_id;

      insert into public.prepared_meat_stock_movements (
        legacy_id,
        prepared_meat_item_id,
        prepared_meat_item_legacy_id,
        meat_customer_id,
        meat_customer_legacy_id,
        meat_order_line_id,
        meat_order_line_legacy_id,
        movement_at,
        outbound_packages,
        remarks,
        bubble_created_at,
        bubble_modified_at
      )
      values (
        'web-prep-stock-' || gen_random_uuid()::text,
        v_prepared.id,
        v_prepared.legacy_id,
        v_customer.id,
        v_customer.legacy_id,
        v_line_id,
        (select legacy_id from public.meat_order_lines where id = v_line_id),
        v_shipping_at,
        v_quantity,
        nullif(btrim(coalesce(v_line ->> 'remarks', '')), ''),
        now(),
        now()
      );
    end if;
  end loop;

  return v_order_id;
end;
$$;

revoke all on function public.save_prepared_meat_outbound(
  uuid, uuid, uuid, text, date, text, text, text, text, jsonb
) from public;
grant execute on function public.save_prepared_meat_outbound(
  uuid, uuid, uuid, text, date, text, text, text, text, jsonb
) to authenticated;

comment on function public.save_prepared_meat_outbound(
  uuid, uuid, uuid, text, date, text, text, text, text, jsonb
) is
  'Creates or updates a prepared-meat delivery note, contact fields, lines, and stock movements. Outbound quantity cannot exceed on-hand stock.';
