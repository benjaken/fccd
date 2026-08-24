-- Allow the fleet fee drawer to load all fleet/district fees once, then apply
-- driver-team and district filters with client-side pagination.

create or replace function public.delivery_fleet_fee_list(p_fleet_id uuid)
returns table (
  district_id uuid,
  fleet_id uuid,
  fleet_name text,
  district_name text,
  fee numeric
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('delivery.fleets') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return query
  select district.id, team.id, team.name, district.name,
    coalesce(district.default_fee, 0)::numeric
  from public.delivery_districts as district
  join public.delivery_teams as team on team.id = district.driver_team_id
  where (p_fleet_id is null or team.id = p_fleet_id)
    and team.archived_at is null
    and district.archived_at is null
  order by team.name, district.name;
end;
$$;

revoke all on function public.delivery_fleet_fee_list(uuid) from public, anon;
grant execute on function public.delivery_fleet_fee_list(uuid) to authenticated;
