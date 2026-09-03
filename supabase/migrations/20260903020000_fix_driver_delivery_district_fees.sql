-- Driver portal district fees still joined fleet-owned delivery_districts
-- rows. Those copies were archived when pricing moved to
-- delivery_fleet_district_fees, so the page returned an empty list.

create or replace function public.driver_delivery_district_fees(
  p_session_token uuid,
  p_search text default null
)
returns table(id uuid, name text, fee numeric)
language sql
stable
security definer
set search_path = public, private
as $$
  select district.id, district.name, coalesce(price.fee, 0)
  from private.driver_delivery_sessions as session
  cross join public.delivery_districts as district
  left join public.delivery_fleet_district_fees as price
    on price.delivery_team_id = session.delivery_team_id
   and price.district_id = district.id
  where session.token = p_session_token
    and session.expires_at > now()
    and district.driver_team_id is null
    and district.archived_at is null
    and (
      nullif(btrim(p_search), '') is null
      or district.name ilike '%' || btrim(p_search) || '%'
    )
  order by district.name;
$$;

revoke all on function public.driver_delivery_district_fees(uuid, text)
  from public;
grant execute on function public.driver_delivery_district_fees(uuid, text)
  to anon, authenticated;
