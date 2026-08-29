-- HK Lunch Box orders use the historical global B-{sequence} numbering.
-- Quotes remain FCBQ{yyyymm}{sequence}; converting a quote creates a new,
-- linked order and must request a fresh order number instead of replacing Q
-- with O in the quote number.

create or replace function private.assign_web_order_number()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_channel_name text;
  v_prefix text;
  v_month text := to_char(timezone('Asia/Hong_Kong', now()), 'YYYYMM');
  v_sequence integer;
begin
  if new.document_type <> 'order'
     or new.legacy_id not like 'web-order-%'
     or nullif(btrim(new.order_number), '') is not null then
    return new;
  end if;

  select lower(btrim(channels.name))
  into v_channel_name
  from public.channels
  where channels.id = new.channel_id;

  v_prefix := case v_channel_name
    when 'catering' then '#'
    when 'hk lunch box' then 'B-'
    when 'kitchen' then 'K-'
    when 'express' then 'E-'
    when 'cuisine' then 'L-'
    when 'delivery' then 'D-'
    when 'residential' then 'R-'
    when 'hk party food' then 'P-'
    else null
  end;

  if v_prefix is not null then
    perform pg_advisory_xact_lock(hashtext('order-number-' || v_prefix));

    select coalesce(
      max(substring(orders.order_number from char_length(v_prefix) + 1)::integer),
      0
    ) + 1
    into v_sequence
    from public.orders
    where orders.order_number ~ ('^' || v_prefix || '[0-9]+$');

    new.order_number := v_prefix || v_sequence::text;
    return new;
  end if;

  v_prefix := 'FCO';

  perform pg_advisory_xact_lock(hashtext('order-number-' || v_prefix || v_month));
  select coalesce(
    max(substring(orders.order_number from char_length(v_prefix) + 7)::integer),
    0
  ) + 1
  into v_sequence
  from public.orders
  where orders.order_number ~ ('^' || v_prefix || v_month || '[0-9]+$');

  new.order_number := v_prefix || v_month || lpad(v_sequence::text, 2, '0');
  return new;
end;
$$;

create or replace function public.convert_quote_to_order(p_quote_id uuid)
returns table(id uuid, order_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quote public.orders%rowtype;
  v_order_id uuid;
  v_order_number text;
begin
  select * into v_quote
  from public.orders
  where orders.id = p_quote_id
    and orders.document_type in ('quote', 'unconfirmed')
    and orders.archived_at is null
  for update;

  if not found then
    raise exception 'quote_not_found' using errcode = 'P0002';
  end if;

  select orders.id, orders.order_number
    into v_order_id, v_order_number
  from public.orders
  where orders.source_quote_id = p_quote_id
    and orders.document_type = 'order'
    and orders.archived_at is null
  limit 1;

  if v_order_id is not null then
    return query select v_order_id, v_order_number;
    return;
  end if;

  v_order_id := gen_random_uuid();

  insert into public.orders as inserted (
    id, legacy_id, source_quote_id, customer_id, channel_id, order_number,
    document_type, delivery_status, customer_name_snapshot,
    company_name_snapshot, email_snapshot, contact_number_a_snapshot,
    contact_number_b_snapshot, shipping_address_snapshot,
    customer_note_snapshot, quote_description_snapshot, delivery_terms_snapshot,
    currency, discount_amount, shipping_fee, cashdollar_purchased,
    cashdollar_redeemed, grand_total, outstanding, delivery_at, ship_out_time,
    remarks, factory_packing_note, shipping_method_id, delivery_time,
    sales_partner_id, asana_link, is_quote_original, is_sent_to_factory
  ) values (
    v_order_id, 'web-order-' || v_order_id, p_quote_id, v_quote.customer_id,
    v_quote.channel_id, null, 'order', 'Pending',
    v_quote.customer_name_snapshot, v_quote.company_name_snapshot,
    v_quote.email_snapshot, v_quote.contact_number_a_snapshot,
    v_quote.contact_number_b_snapshot, v_quote.shipping_address_snapshot,
    v_quote.customer_note_snapshot, v_quote.quote_description_snapshot,
    v_quote.delivery_terms_snapshot, v_quote.currency, v_quote.discount_amount,
    v_quote.shipping_fee, v_quote.cashdollar_purchased,
    v_quote.cashdollar_redeemed, v_quote.grand_total, v_quote.outstanding,
    v_quote.delivery_at, v_quote.ship_out_time, v_quote.remarks,
    v_quote.factory_packing_note, v_quote.shipping_method_id,
    v_quote.delivery_time, v_quote.sales_partner_id, v_quote.asana_link,
    false, false
  )
  returning inserted.order_number into v_order_number;

  insert into public.order_lines (
    id, legacy_id, order_id, product_id, package_id, sku_snapshot,
    product_name_snapshot, content_snapshot, quantity, new_quantity_text,
    unit_price, total_price, item_order, type_sort, remarks_1, remarks_2,
    delivery_at, is_addon, is_void, is_printed, is_sent_to_factory
  )
  select gen_random_uuid(), 'web-order-line-' || gen_random_uuid(), v_order_id,
    product_id, package_id, sku_snapshot, product_name_snapshot,
    content_snapshot, quantity, new_quantity_text, unit_price, total_price,
    item_order, type_sort, remarks_1, remarks_2, delivery_at, is_addon,
    false, false, false
  from public.order_lines
  where order_id = p_quote_id and is_void = false;

  insert into public.deliveries (
    id, legacy_id, order_id, district_id, shipping_method_id,
    delivery_at, delivery_time, ship_out_time, delivery_status, total_fee
  )
  select gen_random_uuid(), 'web-delivery-' || gen_random_uuid(), v_order_id,
    district_id, shipping_method_id, delivery_at, delivery_time, ship_out_time,
    'Pending', total_fee
  from public.deliveries
  where order_id = p_quote_id;

  insert into public.order_tag_assignments(order_id, order_tag_id)
  select v_order_id, order_tag_id
  from public.order_tag_assignments
  where order_id = p_quote_id
  on conflict do nothing;

  insert into public.payments (
    id, legacy_id, order_id, channel_id, payment_method_id,
    order_number_snapshot, currency, amount, payment_at, payout_at,
    paypal_reference, receipt_reference
  )
  select gen_random_uuid(), 'web-payment-' || gen_random_uuid(), v_order_id,
    channel_id, payment_method_id, v_order_number, currency, amount,
    payment_at, payout_at, paypal_reference, receipt_reference
  from public.payments
  where order_id = p_quote_id and voided_at is null;

  update public.orders
  set quote_status = 'Done Deal', archived_at = now(), updated_at = now()
  where orders.id = p_quote_id;

  return query select v_order_id, v_order_number;
end;
$$;

grant execute on function public.convert_quote_to_order(uuid) to authenticated;

-- Repair the only order produced by the incorrect FCBQ -> FCBO conversion.
do $$
declare
  v_order_id uuid;
  v_order_number text;
  v_sequence integer;
begin
  select generated.id
  into v_order_id
  from public.orders as generated
  join public.orders as quote on quote.id = generated.source_quote_id
  join public.channels as channel on channel.id = generated.channel_id
  where generated.document_type = 'order'
    and generated.order_number = 'FCBO20260843'
    and quote.order_number = 'FCBQ20260843'
    and lower(btrim(channel.name)) = 'hk lunch box'
  for update of generated;

  if v_order_id is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('order-number-B'));
  select coalesce(max(substring(orders.order_number from 3)::integer), 0) + 1
  into v_sequence
  from public.orders
  where orders.order_number ~ '^B-[0-9]+$';

  v_order_number := 'B-' || v_sequence::text;

  update public.orders
  set order_number = v_order_number,
      updated_at = now()
  where id = v_order_id;

  update public.payments
  set order_number_snapshot = v_order_number,
      updated_at = now()
  where order_id = v_order_id;
end;
$$;
