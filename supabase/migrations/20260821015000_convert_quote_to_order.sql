alter table public.orders
  add column if not exists source_quote_id uuid references public.orders(id);

create unique index if not exists orders_source_quote_id_unique_idx
  on public.orders(source_quote_id)
  where source_quote_id is not null and document_type = 'order';

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
  v_order_number := case
    when coalesce(v_quote.order_number, '') <> '' then replace(v_quote.order_number, 'Q', 'O')
    else 'B-' || to_char(timezone('Asia/Hong_Kong', clock_timestamp()), 'YYMMDDHH24MISS')
  end;

  insert into public.orders (
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
    v_quote.channel_id, v_order_number, 'order', 'Pending',
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
  );

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
