create or replace function public.copy_quote_content(
  p_source_id uuid,
  p_target_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_source_id = p_target_id then
    raise exception 'quote_copy_same_record' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.orders
    where id = p_source_id
      and document_type in ('quote', 'unconfirmed')
      and archived_at is null
  ) then
    raise exception 'source_quote_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.orders
    where id = p_target_id
      and document_type = 'quote'
      and archived_at is null
  ) then
    raise exception 'target_quote_not_found' using errcode = 'P0002';
  end if;

  update public.orders target
  set quote_description_snapshot = source.quote_description_snapshot,
      shipping_fee = coalesce(source.shipping_fee, 0),
      discount_amount = coalesce(source.discount_amount, 0),
      cashdollar_redeemed = coalesce(source.cashdollar_redeemed, 0),
      cashdollar_purchased = coalesce(source.cashdollar_purchased, 0),
      updated_at = now()
  from public.orders source
  where source.id = p_source_id
    and target.id = p_target_id;

  insert into public.order_lines (
    id,
    legacy_id,
    order_id,
    product_id,
    product_legacy_id,
    package_id,
    package_legacy_id,
    sku_snapshot,
    product_name_snapshot,
    content_snapshot,
    quantity,
    new_quantity_text,
    unit_price,
    total_price,
    item_order,
    type_sort,
    remarks_1,
    remarks_2,
    delivery_at,
    is_addon,
    is_void,
    is_printed,
    is_sent_to_factory
  )
  select
    gen_random_uuid(),
    'web-quote-copy-line-' || gen_random_uuid(),
    p_target_id,
    source.product_id,
    source.product_legacy_id,
    source.package_id,
    source.package_legacy_id,
    source.sku_snapshot,
    source.product_name_snapshot,
    source.content_snapshot,
    source.quantity,
    source.new_quantity_text,
    source.unit_price,
    source.total_price,
    source.item_order,
    source.type_sort,
    source.remarks_1,
    source.remarks_2,
    target.delivery_at,
    source.is_addon,
    false,
    false,
    false
  from public.order_lines source
  cross join public.orders target
  where source.order_id = p_source_id
    and not source.is_void
    and target.id = p_target_id;

  perform private.recalculate_quote_total(p_target_id);
end;
$$;

revoke all on function public.copy_quote_content(uuid,uuid) from public;
grant execute on function public.copy_quote_content(uuid,uuid) to authenticated;

create or replace function public.duplicate_quote(
  p_source_id uuid,
  p_channel_id uuid default null,
  p_customer_name text default null,
  p_company_name text default null,
  p_contact_a text default null,
  p_contact_b text default null,
  p_email text default null,
  p_address text default null,
  p_district_id uuid default null,
  p_district_name text default null,
  p_shipping_method_id uuid default null,
  p_delivery_date date default null,
  p_delivery_time text default null,
  p_ship_out_time text default null,
  p_customer_note text default null,
  p_packing_note text default null,
  p_sales_partner_id uuid default null,
  p_internal_note text default null,
  p_order_tag_ids uuid[] default '{}'
)
returns table(id uuid, order_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_order_number text;
begin
  select created.id, created.order_number
  into v_id, v_order_number
  from public.create_quote(
    p_channel_id,
    p_customer_name,
    p_company_name,
    p_contact_a,
    p_contact_b,
    p_email,
    p_address,
    p_district_id,
    p_district_name,
    p_shipping_method_id,
    p_delivery_date,
    p_delivery_time,
    p_ship_out_time,
    p_customer_note,
    p_packing_note,
    p_sales_partner_id,
    p_internal_note,
    p_order_tag_ids
  ) created;

  perform public.copy_quote_content(p_source_id, v_id);
  return query select v_id, v_order_number;
end;
$$;

revoke all on function public.duplicate_quote(
  uuid,uuid,text,text,text,text,text,text,uuid,text,uuid,date,text,text,text,text,uuid,text,uuid[]
) from public;
grant execute on function public.duplicate_quote(
  uuid,uuid,text,text,text,text,text,text,uuid,text,uuid,date,text,text,text,text,uuid,text,uuid[]
) to authenticated;
