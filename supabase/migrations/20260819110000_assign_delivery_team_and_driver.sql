create or replace function public.assign_delivery_team_and_driver(
  p_delivery_id uuid,
  p_motorcade_id uuid,
  p_driver_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_legacy_id text;
  v_team_legacy_id text;
begin
  if ((select auth.jwt()) -> 'app_metadata' ->> 'role')
    not in ('Super Admin', 'Admin', 'Accounting', 'Factory')
  then
    raise exception 'not allowed to assign delivery team and driver';
  end if;

  if p_motorcade_id is null or p_driver_id is null then
    raise exception 'delivery team and driver are required';
  end if;

  select driver.legacy_id, team.legacy_id
  into v_driver_legacy_id, v_team_legacy_id
    from public.delivery_team_drivers driver
    join public.delivery_teams team on team.id = driver.delivery_team_id
    where driver.id = p_driver_id
      and driver.delivery_team_id = p_motorcade_id
      and driver.is_active = true
      and team.is_active = true
      and team.archived_at is null;

  if not found then
    raise exception 'driver does not belong to the selected delivery team';
  end if;

  update public.deliveries
  set
    motorcade_id = p_motorcade_id,
    motorcade_legacy_id = v_team_legacy_id,
    subdriver_id = p_driver_id,
    subdriver_legacy_id = v_driver_legacy_id,
    updated_at = now()
  where id = p_delivery_id;

  if not found then
    raise exception 'delivery not found';
  end if;
end;
$$;

revoke all on function public.assign_delivery_team_and_driver(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.assign_delivery_team_and_driver(uuid, uuid, uuid)
  to authenticated;
