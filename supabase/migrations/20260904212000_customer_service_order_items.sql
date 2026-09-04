begin;

create or replace function public.customer_service_lookup_order_items(
  p_phone text,
  p_order_id uuid
)
returns table (
  order_line_id uuid,
  item_name text,
  item_content text,
  quantity numeric,
  quantity_text text,
  remarks text[]
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_phone text := private.self_service_phone(p_phone);
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if length(coalesce(v_phone, '')) < 8 or p_order_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.orders
    where orders.id = p_order_id
      and orders.document_type = 'order'
      and orders.archived_at is null
      and (
        private.self_service_phone(orders.contact_number_a_snapshot) = v_phone
        or private.self_service_phone(orders.contact_number_b_snapshot) = v_phone
      )
  ) then
    return;
  end if;

  return query
  select
    line.id,
    coalesce(
      nullif(btrim(line.product_name_snapshot), ''),
      nullif(btrim(line.content_snapshot), ''),
      nullif(btrim(line.sku_snapshot), ''),
      '未命名菜式'
    ),
    case
      when nullif(btrim(line.content_snapshot), '') is distinct from
        nullif(btrim(line.product_name_snapshot), '')
        then nullif(btrim(line.content_snapshot), '')
      else null
    end,
    line.quantity,
    nullif(btrim(line.new_quantity_text), ''),
    coalesce(
      nullif(line.label_remarks, '{}'::text[]),
      array_remove(array[line.remarks_1, line.remarks_2], null),
      '{}'::text[]
    )
  from public.order_lines line
  where line.order_id = p_order_id
    and not line.is_void
  order by line.item_order nulls last, line.created_at, line.id;
end;
$$;

revoke all on function public.customer_service_lookup_order_items(text, uuid)
from public, anon, authenticated;
grant execute on function public.customer_service_lookup_order_items(text, uuid)
to service_role;

comment on function public.customer_service_lookup_order_items(text, uuid) is
  'Returns order dish details only when the service-role caller supplies the WhatsApp phone that owns the order.';

commit;
