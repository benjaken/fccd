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
        coalesce(org.id::text, 'company:' || btrim(live.company_name_snapshot)) as organization_id,
        coalesce(org.name, btrim(live.company_name_snapshot)) as organization_name,
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
      from orders live
      left join customer_portal_orders po on po.order_id = live.id
      left join customer_portal_orders quoted on quoted.order_id = live.source_quote_id
      left join customer_organizations org on org.id = coalesce(po.organization_id, quoted.organization_id)
      left join channels c on c.id = live.channel_id
      where live.archived_at is null
        and live.delivery_at is not null
        and (timezone('Asia/Hong_Kong', live.delivery_at))::date between p_from and p_to
        and not exists (
          select 1 from orders newer
          where newer.source_quote_id = live.id
            and newer.document_type = 'order'
            and newer.archived_at is null
        )
        and (
          org.id is not null
          or nullif(btrim(live.company_name_snapshot), '') is not null
        )
    ) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.customer_portal_ops_meal_calendar(date, date) from public, anon;
grant execute on function public.customer_portal_ops_meal_calendar(date, date) to authenticated;
