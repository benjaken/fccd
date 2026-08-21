-- Native quote creation: save the quote header first, then manage line items.

create table if not exists public.order_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_tag_id uuid not null references public.order_tags(id),
  created_at timestamptz not null default now(),
  unique (order_id, order_tag_id)
);

create index if not exists order_tag_assignments_order_id_idx
  on public.order_tag_assignments(order_id);

alter table public.order_tag_assignments enable row level security;
grant select, insert, update, delete on public.order_tag_assignments to authenticated;

create policy "Operations read order tag assignments"
on public.order_tag_assignments for select to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting', 'Factory')
);

create policy "Administrators write order tag assignments"
on public.order_tag_assignments for all to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('Super Admin', 'Admin')
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('Super Admin', 'Admin')
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
  p_order_tag_ids uuid[] default '{}'
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
  v_order_number text;
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

  perform pg_advisory_xact_lock(hashtext('quote-number-' || v_month));
  select coalesce(max(substring(o.order_number from 11)::integer), 0) + 1
    into v_sequence
  from public.orders o
  where o.order_number ~ ('^FCLQ' || v_month || '[0-9]+$');
  v_order_number := 'FCLQ' || v_month || lpad(v_sequence::text, 2, '0');
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
  );

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

create or replace function private.recalculate_quote_total(p_order_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.orders o
  set grand_total = greatest(
        coalesce((select sum(l.total_price) from public.order_lines l where l.order_id = p_order_id and not l.is_void), 0)
        + coalesce(o.shipping_fee, 0) - coalesce(o.discount_amount, 0),
        0
      ),
      outstanding = greatest(
        coalesce((select sum(l.total_price) from public.order_lines l where l.order_id = p_order_id and not l.is_void), 0)
        + coalesce(o.shipping_fee, 0) - coalesce(o.discount_amount, 0),
        0
      ),
      updated_at = now()
  where o.id = p_order_id and o.document_type = 'quote';
$$;

create or replace function public.add_quote_line(
  p_order_id uuid,
  p_item_kind text,
  p_item_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_remarks text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line_id uuid := gen_random_uuid();
  v_sku text;
  v_name text;
  v_product_id uuid;
  v_package_id uuid;
  v_item_order numeric;
begin
  if p_quantity <= 0 or p_unit_price < 0 then
    raise exception 'invalid_quote_line' using errcode = '22023';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id and document_type = 'quote') then
    raise exception 'quote_not_found' using errcode = 'P0002';
  end if;

  if p_item_kind = 'product' then
    select p.id, p.sku, coalesce(p.chinese_name, p.name)
      into v_product_id, v_sku, v_name
    from public.products p where p.id = p_item_id and p.archived_at is null;
  elsif p_item_kind = 'package' then
    select p.id, p.sku, coalesce(p.chinese_name, p.name)
      into v_package_id, v_sku, v_name
    from public.packages p where p.id = p_item_id and p.archived_at is null;
  else
    raise exception 'invalid_item_kind' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'catalog_item_not_found' using errcode = 'P0002';
  end if;

  select coalesce(max(item_order), 0) + 1 into v_item_order
  from public.order_lines where order_id = p_order_id;

  insert into public.order_lines (
    id, legacy_id, order_id, product_id, package_id, sku_snapshot,
    product_name_snapshot, quantity, unit_price, total_price, item_order, remarks_1
  ) values (
    v_line_id, 'web-quote-line-' || v_line_id, p_order_id, v_product_id,
    v_package_id, v_sku, v_name, p_quantity, p_unit_price,
    round(p_quantity * p_unit_price, 2), v_item_order, nullif(btrim(p_remarks), '')
  );
  perform private.recalculate_quote_total(p_order_id);
  return v_line_id;
end;
$$;

create or replace function public.remove_quote_line(p_line_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  delete from public.order_lines
  where id = p_line_id
  returning order_id into v_order_id;
  if v_order_id is null then
    raise exception 'quote_line_not_found' using errcode = 'P0002';
  end if;
  perform private.recalculate_quote_total(v_order_id);
end;
$$;

grant execute on function public.create_quote(uuid,text,text,text,text,text,text,uuid,text,uuid,date,text,text,text,text,uuid,text,uuid[]) to authenticated;
grant execute on function public.add_quote_line(uuid,text,uuid,numeric,numeric,text) to authenticated;
grant execute on function public.remove_quote_line(uuid) to authenticated;
