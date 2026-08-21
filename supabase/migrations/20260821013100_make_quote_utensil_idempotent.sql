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
      and document_type in ('quote', 'unconfirmed')
      and archived_at is null
  ) then
    raise exception 'quote_not_found' using errcode = 'P0002';
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
    v_line_id, 'web-quote-utensil-' || v_line_id, p_order_id, '餐具包', '餐具包',
    1, 0, 0, v_item_order, true
  );

  perform private.recalculate_quote_total(p_order_id);
  return v_line_id;
end;
$$;

revoke all on function public.add_quote_utensil_line(uuid) from public;
grant execute on function public.add_quote_utensil_line(uuid) to authenticated;
