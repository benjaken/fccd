-- The legacy add-on setting's channel identifies the product catalogue group;
-- it does not restrict which order channel may buy the item. Make the active
-- add-on catalogue available to every otherwise-eligible self-service order.

create or replace function private.self_service_addon_unavailable_reason(p_order public.orders)
returns text
language plpgsql
stable
set search_path = public, private
as $$
declare
  v_delivery_date date;
  v_cutoff timestamptz;
begin
  if p_order.id is null or p_order.document_type <> 'order' or p_order.archived_at is not null then
    return 'order_unavailable';
  end if;
  if p_order.delivery_at is null then return 'delivery_date_missing'; end if;
  if coalesce(p_order.delivery_status, '') in ('已取消', '己取消', '取消', '已送達', '己送達') then
    return 'order_closed';
  end if;
  v_delivery_date := (p_order.delivery_at at time zone 'Asia/Hong_Kong')::date;
  if exists (
    select 1 from public.self_service_addon_block_dates block
    where block.block_date = v_delivery_date and block.archived_at is null
  ) then
    return 'block_date';
  end if;
  v_cutoff := private.self_service_addon_cutoff(p_order.delivery_at);
  if now() >= v_cutoff then return 'cutoff_passed'; end if;
  if not exists (
    select 1
    from public.self_service_addon_products setting
    join public.products product on product.id = setting.product_id
    where setting.is_active and setting.archived_at is null
      and product.is_active and product.archived_at is null
      and coalesce(setting.price_override, product.price) > 0
  ) then
    return 'no_products';
  end if;
  return null;
end;
$$;

create or replace function public.customer_self_service_addon_options(
  p_session_token uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session private.customer_self_service_sessions%rowtype;
  v_order public.orders%rowtype;
  v_reason text;
begin
  select * into v_session from private.customer_self_service_sessions session
  where session.token = p_session_token and session.expires_at > now();
  if v_session.token is null then
    raise exception 'self_service_session_expired' using errcode = '28000';
  end if;

  select * into v_order from public.orders orders
  where orders.id = p_order_id
    and orders.document_type = 'order'
    and orders.archived_at is null
    and private.self_service_order_matches(orders, v_session.phone_hash, v_session.email_hash);
  if v_order.id is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;

  v_reason := private.self_service_addon_unavailable_reason(v_order);
  return jsonb_build_object(
    'canAddOn', v_reason is null,
    'reason', v_reason,
    'cutoffAt', private.self_service_addon_cutoff(v_order.delivery_at),
    'hasAddOn', exists (
      select 1 from public.order_lines line
      where line.order_id = v_order.id and line.is_addon and not line.is_void
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', setting.id,
        'productId', product.id,
        'sku', product.sku,
        'name', coalesce(nullif(btrim(product.chinese_name), ''), product.name),
        'price', coalesce(setting.price_override, product.price),
        'minQuantity', setting.min_quantity,
        'maxQuantity', setting.max_quantity
      ) order by setting.sort_order, product.sku, product.name)
      from public.self_service_addon_products setting
      join public.products product on product.id = setting.product_id
      where setting.is_active and setting.archived_at is null
        and product.is_active and product.archived_at is null
        and coalesce(setting.price_override, product.price) > 0
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.customer_self_service_prepare_addon_checkout(
  p_session_token uuid,
  p_order_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session private.customer_self_service_sessions%rowtype;
  v_order public.orders%rowtype;
  v_reason text;
  v_cart jsonb;
  v_amount numeric(14,2);
  v_checkout_id uuid;
  v_request_id uuid;
  v_cutoff timestamptz;
begin
  select * into v_session from private.customer_self_service_sessions session
  where session.token = p_session_token and session.expires_at > now();
  if v_session.token is null then raise exception 'self_service_session_expired' using errcode = '28000'; end if;

  select * into v_order from public.orders orders
  where orders.id = p_order_id
    and orders.document_type = 'order'
    and orders.archived_at is null
    and private.self_service_order_matches(orders, v_session.phone_hash, v_session.email_hash)
  for update;
  if v_order.id is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;

  v_reason := private.self_service_addon_unavailable_reason(v_order);
  if v_reason is not null then raise exception '%', v_reason using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid_addon_cart' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)) <>
     (select count(distinct item.product_id) from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)) then
    raise exception 'duplicate_addon_product' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    left join public.self_service_addon_products setting
      on setting.product_id = item.product_id
     and setting.is_active and setting.archived_at is null
    left join public.products product
      on product.id = setting.product_id and product.is_active and product.archived_at is null
    where setting.id is null or product.id is null or item.quantity is null
      or item.quantity < setting.min_quantity or item.quantity > setting.max_quantity
      or coalesce(setting.price_override, product.price) <= 0
  ) then
    raise exception 'invalid_addon_item' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object(
           'product_id', product.id, 'sku', product.sku,
           'name', coalesce(nullif(btrim(product.chinese_name), ''), product.name),
           'quantity', item.quantity,
           'unit_price', coalesce(setting.price_override, product.price),
           'total_price', round(item.quantity * coalesce(setting.price_override, product.price), 2)
         ) order by setting.sort_order, product.sku),
         round(sum(item.quantity * coalesce(setting.price_override, product.price)), 2)
    into v_cart, v_amount
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
  join public.self_service_addon_products setting
    on setting.product_id = item.product_id
   and setting.is_active and setting.archived_at is null
  join public.products product on product.id = setting.product_id
   and product.is_active and product.archived_at is null;

  v_cutoff := private.self_service_addon_cutoff(v_order.delivery_at);
  insert into public.customer_self_service_addon_checkouts(
    order_id, cart_snapshot, amount, currency, cutoff_at, expires_at
  ) values (
    v_order.id, v_cart, v_amount, v_order.currency,
    v_cutoff, least(v_cutoff, now() + interval '30 minutes')
  ) returning id, request_id into v_checkout_id, v_request_id;

  return jsonb_build_object(
    'checkoutId', v_checkout_id,
    'requestId', v_request_id,
    'amount', v_amount,
    'currency', v_order.currency,
    'orderNumber', v_order.order_number,
    'cutoffAt', v_cutoff
  );
end;
$$;
