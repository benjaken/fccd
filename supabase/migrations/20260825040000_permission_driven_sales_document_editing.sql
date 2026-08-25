-- Make order and quote editing follow role_page_permissions instead of
-- hard-coded JWT role names. Admin keeps its previous effective access as the
-- migration default; other roles can be enabled from Role Permissions.

update public.role_page_permissions
set can_access = true,
    can_manage = true,
    updated_at = now()
where role = 'Admin'
  and page_key in ('orders', 'quotes');

create or replace function private.has_sales_document_manage(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when document.document_type = 'order'
      then private.has_page_manage('orders')
    when document.document_type in ('quote', 'unconfirmed')
      then private.has_page_manage('quotes')
    else false
  end
  from public.orders as document
  where document.id = target_order_id
    and document.archived_at is null;
$$;

revoke all on function private.has_sales_document_manage(uuid)
  from public, anon, authenticated;
grant execute on function private.has_sales_document_manage(uuid)
  to authenticated;

drop policy if exists "Administrators insert orders" on public.orders;
drop policy if exists "Administrators update orders" on public.orders;
drop policy if exists "Administrators delete orders" on public.orders;

create policy "Document managers insert orders"
on public.orders
for insert
to authenticated
with check (
  case
    when document_type = 'order' then private.has_page_manage('orders')
    when document_type in ('quote', 'unconfirmed') then private.has_page_manage('quotes')
    else false
  end
);

create policy "Document managers update orders"
on public.orders
for update
to authenticated
using (private.has_sales_document_manage(id))
with check (
  case
    when document_type = 'order' then private.has_page_manage('orders')
    when document_type in ('quote', 'unconfirmed') then private.has_page_manage('quotes')
    else false
  end
);

create policy "Document managers delete orders"
on public.orders
for delete
to authenticated
using (private.has_sales_document_manage(id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['order_lines', 'payments']
  loop
    execute format(
      'drop policy if exists "Administrators insert %1$s" on public.%1$I',
      table_name
    );
    execute format(
      'drop policy if exists "Administrators update %1$s" on public.%1$I',
      table_name
    );
    execute format(
      'drop policy if exists "Administrators delete %1$s" on public.%1$I',
      table_name
    );
    execute format(
      'create policy "Document managers insert %1$s" on public.%1$I
       for insert to authenticated
       with check (private.has_sales_document_manage(order_id))',
      table_name
    );
    execute format(
      'create policy "Document managers update %1$s" on public.%1$I
       for update to authenticated
       using (private.has_sales_document_manage(order_id))
       with check (private.has_sales_document_manage(order_id))',
      table_name
    );
    execute format(
      'create policy "Document managers delete %1$s" on public.%1$I
       for delete to authenticated
       using (private.has_sales_document_manage(order_id))',
      table_name
    );
  end loop;
end;
$$;

drop policy if exists "Administrators insert deliveries" on public.deliveries;
drop policy if exists "Administrators update deliveries" on public.deliveries;
drop policy if exists "Administrators delete deliveries" on public.deliveries;

create policy "Delivery managers insert deliveries"
on public.deliveries for insert to authenticated
with check (
  private.has_sales_document_manage(order_id)
  or private.has_page_manage('delivery')
);

create policy "Delivery managers update deliveries"
on public.deliveries for update to authenticated
using (
  private.has_sales_document_manage(order_id)
  or private.has_page_manage('delivery')
)
with check (
  private.has_sales_document_manage(order_id)
  or private.has_page_manage('delivery')
);

create policy "Delivery managers delete deliveries"
on public.deliveries for delete to authenticated
using (
  private.has_sales_document_manage(order_id)
  or private.has_page_manage('delivery')
);

drop policy if exists "Administrators write order tag assignments"
  on public.order_tag_assignments;

create policy "Document managers insert order tag assignments"
on public.order_tag_assignments
for insert
to authenticated
with check (private.has_sales_document_manage(order_id));

create policy "Document managers update order tag assignments"
on public.order_tag_assignments
for update
to authenticated
using (private.has_sales_document_manage(order_id))
with check (private.has_sales_document_manage(order_id));

create policy "Document managers delete order tag assignments"
on public.order_tag_assignments
for delete
to authenticated
using (private.has_sales_document_manage(order_id));

-- Wrap the two SECURITY DEFINER editor RPCs so their authorization follows the
-- same document permission. Their private implementations intentionally omit
-- the legacy role check; only the permission-checked public wrappers can run.
alter function public.update_quote_financials(uuid, numeric, numeric, numeric, numeric)
  rename to update_quote_financials_permission_impl;
alter function public.add_quote_utensil_line(uuid)
  rename to add_quote_utensil_line_permission_impl;

revoke all on function public.update_quote_financials_permission_impl(uuid, numeric, numeric, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.add_quote_utensil_line_permission_impl(uuid)
  from public, anon, authenticated;

create or replace function public.update_quote_financials_permission_impl(
  p_order_id uuid,
  p_shipping_fee numeric,
  p_discount_amount numeric,
  p_cashdollar_redeemed numeric,
  p_cashdollar_purchased numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if least(
    coalesce(p_shipping_fee, 0),
    coalesce(p_discount_amount, 0),
    coalesce(p_cashdollar_redeemed, 0),
    coalesce(p_cashdollar_purchased, 0)
  ) < 0 then
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

create or replace function public.add_quote_utensil_line_permission_impl(
  p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line_id uuid;
  v_item_order numeric;
begin
  if not exists (
    select 1
    from public.orders
    where id = p_order_id
      and document_type in ('quote', 'unconfirmed', 'order')
      and archived_at is null
  ) then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  select id
  into v_line_id
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
  select coalesce(max(item_order), 0) + 1
  into v_item_order
  from public.order_lines
  where order_id = p_order_id;

  insert into public.order_lines (
    id,
    legacy_id,
    order_id,
    product_name_snapshot,
    content_snapshot,
    quantity,
    unit_price,
    total_price,
    item_order,
    is_addon
  ) values (
    v_line_id,
    'web-order-utensil-' || v_line_id,
    p_order_id,
    '餐具包',
    '餐具包',
    1,
    0,
    0,
    v_item_order,
    true
  );

  perform private.recalculate_quote_total(p_order_id);
  return v_line_id;
end;
$$;

create function public.update_quote_financials(
  p_order_id uuid,
  p_shipping_fee numeric,
  p_discount_amount numeric,
  p_cashdollar_redeemed numeric,
  p_cashdollar_purchased numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.has_sales_document_manage(p_order_id) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  perform public.update_quote_financials_permission_impl(
    p_order_id,
    p_shipping_fee,
    p_discount_amount,
    p_cashdollar_redeemed,
    p_cashdollar_purchased
  );
end;
$$;

create function public.add_quote_utensil_line(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.has_sales_document_manage(p_order_id) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  return public.add_quote_utensil_line_permission_impl(p_order_id);
end;
$$;

revoke all on function public.update_quote_financials(uuid, numeric, numeric, numeric, numeric)
  from public, anon;
revoke all on function public.add_quote_utensil_line(uuid)
  from public, anon;
grant execute on function public.update_quote_financials(uuid, numeric, numeric, numeric, numeric)
  to authenticated;
grant execute on function public.add_quote_utensil_line(uuid)
  to authenticated;
