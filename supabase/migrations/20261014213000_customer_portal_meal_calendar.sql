-- Staff calendar of group-customer meal orders by Hong Kong service date.
create or replace function public.customer_portal_ops_meal_calendar(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 45 then
    raise exception 'invalid_range';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.service_date, x.organization_name, x.order_number)
    from (
      select
        live.id as order_id,
        live.order_number,
        org.id as organization_id,
        org.name as organization_name,
        (timezone('Asia/Hong_Kong', live.delivery_at))::date as service_date,
        live.delivery_time,
        live.delivery_status,
        live.document_type,
        c.name as brand,
        live.shipping_address_snapshot as address,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', coalesce(nullif(btrim(l.product_name_snapshot), ''), '未命名餐點'),
            'quantity', l.quantity
          ) order by l.product_name_snapshot, l.id)
          from order_lines l
          where l.order_id = live.id and not l.is_void
        ), '[]'::jsonb) as lines
      from customer_portal_orders po
      join customer_organizations org on org.id = po.organization_id
      join orders linked on linked.id = po.order_id
      left join lateral (
        select n.id from orders n
        where n.source_quote_id = linked.id
          and n.document_type = 'order'
          and n.archived_at is null
        order by n.created_at desc
        limit 1
      ) converted on true
      join orders live on live.id = coalesce(converted.id, linked.id)
      left join channels c on c.id = live.channel_id
      where live.archived_at is null
        and live.delivery_at is not null
        and (timezone('Asia/Hong_Kong', live.delivery_at))::date between p_from and p_to
    ) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.customer_portal_ops_meal_calendar(date, date) from public, anon;
grant execute on function public.customer_portal_ops_meal_calendar(date, date) to authenticated;
