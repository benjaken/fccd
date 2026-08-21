-- The order editor now deliberately shares the quote editor workflow.  Keep the
-- existing RPC names for backwards compatibility, but allow confirmed orders.

create or replace function private.recalculate_quote_total(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders o
  set grand_total = greatest(
        coalesce((select sum(l.total_price) from public.order_lines l where l.order_id = p_order_id and not l.is_void), 0)
        + coalesce(o.shipping_fee, 0)
        - coalesce(o.discount_amount, 0)
        - coalesce(o.cashdollar_redeemed, 0),
        0
      ),
      outstanding = greatest(
        coalesce((select sum(l.total_price) from public.order_lines l where l.order_id = p_order_id and not l.is_void), 0)
        + coalesce(o.shipping_fee, 0)
        - coalesce(o.discount_amount, 0)
        - coalesce(o.cashdollar_redeemed, 0)
        - case when o.document_type = 'order' then coalesce((select sum(p.amount) from public.payments p where p.order_id = p_order_id and p.voided_at is null), 0) else 0 end,
        0
      ),
      updated_at = now()
  where o.id = p_order_id
    and o.document_type in ('quote', 'unconfirmed', 'order');
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
    raise exception 'invalid_order_line' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.orders
    where id = p_order_id
      and document_type in ('quote', 'unconfirmed', 'order')
      and archived_at is null
  ) then
    raise exception 'document_not_found' using errcode = 'P0002';
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
    v_line_id, 'web-order-line-' || v_line_id, p_order_id, v_product_id,
    v_package_id, v_sku, v_name, p_quantity, p_unit_price,
    round(p_quantity * p_unit_price, 2), v_item_order, nullif(btrim(p_remarks), '')
  );
  perform private.recalculate_quote_total(p_order_id);
  return v_line_id;
end;
$$;

create or replace function public.update_quote_financials(
  p_order_id uuid,
  p_shipping_fee numeric,
  p_discount_amount numeric,
  p_cashdollar_redeemed numeric,
  p_cashdollar_purchased numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('Super Admin', 'Admin', 'Accounting') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if least(coalesce(p_shipping_fee, 0), coalesce(p_discount_amount, 0), coalesce(p_cashdollar_redeemed, 0), coalesce(p_cashdollar_purchased, 0)) < 0 then
    raise exception 'invalid_order_financials' using errcode = '22023';
  end if;

  update public.orders
  set shipping_fee = coalesce(p_shipping_fee, 0),
      discount_amount = coalesce(p_discount_amount, 0),
      cashdollar_redeemed = coalesce(p_cashdollar_redeemed, 0),
      cashdollar_purchased = coalesce(p_cashdollar_purchased, 0),
      updated_at = now()
  where id = p_order_id
    and document_type in ('quote', 'unconfirmed', 'order')
    and archived_at is null;
  if not found then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  perform private.recalculate_quote_total(p_order_id);
end;
$$;

create or replace function public.add_quote_utensil_line(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line_id uuid;
  v_item_order numeric;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('Super Admin', 'Admin', 'Accounting') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.orders
    where id = p_order_id
      and document_type in ('quote', 'unconfirmed', 'order')
      and archived_at is null
  ) then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  select id into v_line_id
  from public.order_lines
  where order_id = p_order_id
    and not is_void
    and coalesce(product_name_snapshot, content_snapshot, '') = '餐具包'
  order by item_order nulls last, created_at
  limit 1;

  if v_line_id is not null then
    return v_line_id;
  end if;

  v_line_id := gen_random_uuid();
  select coalesce(max(item_order), 0) + 1 into v_item_order
  from public.order_lines where order_id = p_order_id;

  insert into public.order_lines (
    id, legacy_id, order_id, product_name_snapshot, content_snapshot,
    quantity, unit_price, total_price, item_order, is_addon
  ) values (
    v_line_id, 'web-order-utensil-' || v_line_id, p_order_id, '餐具包', '餐具包',
    1, 0, 0, v_item_order, true
  );

  perform private.recalculate_quote_total(p_order_id);
  return v_line_id;
end;
$$;

revoke all on function public.update_quote_financials(uuid,numeric,numeric,numeric,numeric) from public;
revoke all on function public.add_quote_utensil_line(uuid) from public;
grant execute on function public.update_quote_financials(uuid,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.add_quote_utensil_line(uuid) to authenticated;
