create or replace function public.add_custom_quote_line(
  p_order_id uuid,
  p_name text,
  p_quantity numeric,
  p_unit_price numeric,
  p_remarks text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line_id uuid := gen_random_uuid();
  v_item_order numeric;
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'custom_product_name_required' using errcode = '22023';
  end if;
  if p_quantity <= 0 or p_unit_price < 0 then
    raise exception 'invalid_order_line' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.orders
    where id = p_order_id
      and document_type in ('quote', 'unconfirmed', 'order')
      and archived_at is null
  ) then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

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
    remarks_1
  ) values (
    v_line_id,
    'web-custom-order-line-' || v_line_id,
    p_order_id,
    btrim(p_name),
    btrim(p_name),
    p_quantity,
    p_unit_price,
    round(p_quantity * p_unit_price, 2),
    v_item_order,
    nullif(btrim(p_remarks), '')
  );

  perform private.recalculate_quote_total(p_order_id);
  return v_line_id;
end;
$$;

grant execute on function public.add_custom_quote_line(uuid,text,numeric,numeric,text)
  to authenticated;
