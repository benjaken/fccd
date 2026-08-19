-- A driver team may only see orders explicitly assigned to that team.
create or replace function public.driver_delivery_available_orders(
  p_session_token uuid,
  p_delivery_date date,
  p_search text default null
)
returns table(
  delivery_id uuid,
  order_number text,
  ship_out_time text,
  delivery_time text,
  address text,
  district_name text,
  shipping_method text,
  warning_text text
)
language sql stable security definer
set search_path = public, private
as $$
  select
    d.id,
    o.order_number,
    coalesce(nullif(btrim(d.ship_out_time), ''), nullif(btrim(o.ship_out_time), '')),
    coalesce(nullif(btrim(d.delivery_time), ''), nullif(btrim(o.delivery_time), '')),
    o.shipping_address_snapshot,
    district.name,
    coalesce(method.display_name, method.name),
    coalesce(nullif(btrim(o.factory_packing_note), ''), nullif(btrim(o.remarks), ''))
  from private.driver_delivery_sessions session
  join public.deliveries d on d.motorcade_id = session.delivery_team_id
  join public.orders o on o.id = d.order_id
  left join public.delivery_districts district on district.id = d.district_id
  left join public.shipping_methods method on method.id = coalesce(d.shipping_method_id, o.shipping_method_id)
  where session.token = p_session_token
    and session.expires_at > now()
    and (d.delivery_at at time zone 'Asia/Hong_Kong')::date = p_delivery_date
    and d.taken_at is null
    and not exists (
      select 1 from private.driver_delivery_rejections rejection
      where rejection.delivery_id = d.id and rejection.delivery_team_id = session.delivery_team_id
    )
    and coalesce(d.delivery_status, o.delivery_status, '') not in ('已取消', '取消', 'Cancelled')
    and (
      nullif(btrim(p_search), '') is null
      or coalesce(o.order_number, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(o.shipping_address_snapshot, '') ilike '%' || btrim(p_search) || '%'
    )
  order by d.delivery_at, o.order_number;
$$;

grant execute on function public.driver_delivery_available_orders(uuid, date, text) to anon, authenticated;
