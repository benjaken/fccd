-- Orders assigned by operations remain available until a driver explicitly accepts them.
create or replace function public.driver_delivery_accepted_order_details(
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
  warning_text text,
  customer_name text,
  customer_phone text,
  basic_fee numeric,
  total_fee numeric,
  taken_at timestamptz,
  fulfilled_at timestamptz,
  driver_id uuid,
  driver_name text,
  surcharges jsonb,
  images text[]
)
language sql stable security definer
set search_path = public, private
as $$
  select
    d.id, o.order_number, coalesce(d.ship_out_time, o.ship_out_time), coalesce(d.delivery_time, o.delivery_time),
    o.shipping_address_snapshot, district.name, coalesce(method.display_name, method.name),
    coalesce(nullif(btrim(o.factory_packing_note), ''), nullif(btrim(o.remarks), '')), o.customer_name_snapshot,
    case when nullif(btrim(o.contact_number_a_snapshot), '') is not null
        and nullif(btrim(o.contact_number_b_snapshot), '') is not null
        and btrim(o.contact_number_a_snapshot) <> btrim(o.contact_number_b_snapshot)
      then btrim(o.contact_number_a_snapshot) || ' / ' || btrim(o.contact_number_b_snapshot)
      else coalesce(nullif(btrim(o.contact_number_a_snapshot), ''), nullif(btrim(o.contact_number_b_snapshot), '')) end,
    coalesce(d.basic_fee, 0), coalesce(d.total_fee, 0), d.taken_at, d.fulfilled_at, driver.id, driver.display_name,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', surcharge.id, 'name', type.name, 'amount', coalesce(surcharge.amount, 0)) order by surcharge.created_at)
      from public.delivery_surcharges surcharge
      join public.delivery_surcharge_types type on type.id = surcharge.surcharge_type_id
      where surcharge.delivery_id = d.id
    ), '[]'::jsonb),
    coalesce(d.image_references, '{}')
  from private.driver_delivery_sessions session
  join public.deliveries d on d.motorcade_id = session.delivery_team_id
  join public.orders o on o.id = d.order_id
  left join public.delivery_districts district on district.id = d.district_id
  left join public.shipping_methods method on method.id = coalesce(d.shipping_method_id, o.shipping_method_id)
  left join public.delivery_team_drivers driver on driver.legacy_id = d.subdriver_legacy_id and driver.delivery_team_id = session.delivery_team_id
  where session.token = p_session_token
    and session.expires_at > now()
    and (d.delivery_at at time zone 'Asia/Hong_Kong')::date = p_delivery_date
    and d.taken_at is not null
    and (
      nullif(btrim(p_search), '') is null
      or coalesce(o.order_number, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(o.shipping_address_snapshot, '') ilike '%' || btrim(p_search) || '%'
    )
  order by d.delivery_at, o.order_number;
$$;

grant execute on function public.driver_delivery_accepted_order_details(uuid, date, text) to anon, authenticated;
