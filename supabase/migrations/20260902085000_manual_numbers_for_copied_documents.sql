-- Copied orders and quotes must use a number entered by the operator.
-- Regular new quotes keep their existing automatic numbering when no number is
-- supplied.

drop function if exists public.duplicate_quote(
  uuid,uuid,text,text,text,text,text,text,uuid,text,uuid,date,text,text,text,text,uuid,text,uuid[]
);
drop function if exists public.create_quote(
  uuid,text,text,text,text,text,text,uuid,text,uuid,date,text,text,text,text,uuid,text,uuid[]
);

create or replace function public.create_quote(
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
  p_order_tag_ids uuid[] default '{}',
  p_order_number text default null
)
returns table(id uuid, order_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_delivery_id uuid := gen_random_uuid();
  v_month text := to_char(timezone('Asia/Hong_Kong', now()), 'YYYYMM');
  v_sequence integer;
  v_order_number text := nullif(btrim(coalesce(p_order_number, '')), '');
  v_delivery_at timestamptz;
  v_district_id uuid := p_district_id;
begin
  if p_channel_id is null then
    raise exception 'channel_required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_customer_name, '')), '') is null
     and nullif(btrim(coalesce(p_company_name, '')), '') is null then
    raise exception 'customer_required' using errcode = '22023';
  end if;

  if v_order_number is null then
    perform pg_advisory_xact_lock(hashtext('quote-number-' || v_month));
    select coalesce(max(substring(o.order_number from 11)::integer), 0) + 1
      into v_sequence
    from public.orders o
    where o.order_number ~ ('^FCLQ' || v_month || '[0-9]+$');
    v_order_number := 'FCLQ' || v_month || lpad(v_sequence::text, 2, '0');
  end if;

  if p_delivery_date is not null then
    v_delivery_at := p_delivery_date::timestamp at time zone 'Asia/Hong_Kong';
  end if;

  if v_district_id is null and nullif(btrim(coalesce(p_district_name, '')), '') is not null then
    select d.id into v_district_id
    from public.delivery_districts d
    where lower(btrim(d.name)) = lower(btrim(p_district_name))
      and d.archived_at is null
    order by d.created_at
    limit 1;
    if v_district_id is null then
      v_district_id := gen_random_uuid();
      insert into public.delivery_districts(id, legacy_id, name)
      values (v_district_id, 'web-auto-district-' || v_district_id, btrim(p_district_name));
    end if;
  end if;

  insert into public.orders (
    id, legacy_id, channel_id, order_number, document_type, quote_status,
    customer_name_snapshot, company_name_snapshot, email_snapshot,
    contact_number_a_snapshot, contact_number_b_snapshot,
    shipping_address_snapshot, customer_note_snapshot,
    shipping_method_id, delivery_at, delivery_time, ship_out_time,
    factory_packing_note, sales_partner_id, remarks,
    grand_total, outstanding, is_quote_original
  ) values (
    v_id, 'web-quote-' || v_id, p_channel_id, v_order_number, 'quote', 'Draft',
    nullif(btrim(p_customer_name), ''), nullif(btrim(p_company_name), ''),
    nullif(btrim(p_email), ''), nullif(btrim(p_contact_a), ''),
    nullif(btrim(p_contact_b), ''), nullif(btrim(p_address), ''),
    nullif(btrim(p_customer_note), ''), p_shipping_method_id, v_delivery_at,
    nullif(btrim(p_delivery_time), ''), nullif(btrim(p_ship_out_time), ''),
    nullif(btrim(p_packing_note), ''), p_sales_partner_id,
    nullif(btrim(p_internal_note), ''), 0, 0, true
  )
  returning order_number into v_order_number;

  if v_district_id is not null or p_shipping_method_id is not null or p_delivery_date is not null then
    insert into public.deliveries (
      id, legacy_id, order_id, district_id, shipping_method_id,
      delivery_at, delivery_time, ship_out_time, delivery_status
    ) values (
      v_delivery_id, 'web-delivery-' || v_delivery_id, v_id, v_district_id,
      p_shipping_method_id, v_delivery_at, nullif(btrim(p_delivery_time), ''),
      nullif(btrim(p_ship_out_time), ''), 'Pending'
    );
  end if;

  insert into public.order_tag_assignments(order_id, order_tag_id)
  select v_id, tag_id
  from unnest(coalesce(p_order_tag_ids, '{}')) as tag_id
  on conflict do nothing;

  return query select v_id, v_order_number;
end;
$$;

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
  p_order_tag_ids uuid[] default '{}',
  p_order_number text default null
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
  if nullif(btrim(coalesce(p_order_number, '')), '') is null then
    raise exception 'order_number_required' using errcode = '22023';
  end if;

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
    p_order_tag_ids,
    p_order_number
  ) created;

  perform public.copy_quote_content(p_source_id, v_id);
  return query select v_id, v_order_number;
end;
$$;

revoke all on function public.create_quote(
  uuid,text,text,text,text,text,text,uuid,text,uuid,date,text,text,text,text,uuid,text,uuid[],text
) from public;
grant execute on function public.create_quote(
  uuid,text,text,text,text,text,text,uuid,text,uuid,date,text,text,text,text,uuid,text,uuid[],text
) to authenticated;

revoke all on function public.duplicate_quote(
  uuid,uuid,text,text,text,text,text,text,uuid,text,uuid,date,text,text,text,text,uuid,text,uuid[],text
) from public;
grant execute on function public.duplicate_quote(
  uuid,uuid,text,text,text,text,text,text,uuid,text,uuid,date,text,text,text,text,uuid,text,uuid[],text
) to authenticated;
