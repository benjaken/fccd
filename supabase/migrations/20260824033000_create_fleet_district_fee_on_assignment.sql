-- Keep a reusable fee row for every fleet/district combination that is
-- encountered while dispatching. New combinations start at HK$0 and can be
-- maintained from Delivery Fleet > Fee Management.

create or replace function private.ensure_delivery_fleet_district_fee()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_district_name text;
  v_fleet_district_id uuid;
  v_fleet_legacy_id text;
begin
  if new.motorcade_id is null or new.district_id is null then
    return new;
  end if;

  select district.name
  into v_district_name
  from public.delivery_districts as district
  where district.id = new.district_id
    and district.archived_at is null;

  if nullif(btrim(v_district_name), '') is null then
    return new;
  end if;

  -- Serialise creation for the same fleet/name pair so simultaneous dispatches
  -- do not create duplicate fee rows.
  perform pg_advisory_xact_lock(
    hashtext(new.motorcade_id::text || ':' || lower(btrim(v_district_name)))
  );

  select district.id
  into v_fleet_district_id
  from public.delivery_districts as district
  where district.driver_team_id = new.motorcade_id
    and lower(btrim(district.name)) = lower(btrim(v_district_name))
    and district.archived_at is null
  order by district.created_at, district.id
  limit 1;

  if v_fleet_district_id is null then
    select team.legacy_id
    into v_fleet_legacy_id
    from public.delivery_teams as team
    where team.id = new.motorcade_id
      and team.archived_at is null;

    if v_fleet_legacy_id is null then
      return new;
    end if;

    insert into public.delivery_districts (
      legacy_id,
      name,
      default_fee,
      driver_team_id,
      driver_team_legacy_id,
      bubble_created_at,
      bubble_modified_at
    ) values (
      'web-fleet-district-' || gen_random_uuid()::text,
      btrim(v_district_name),
      0,
      new.motorcade_id,
      v_fleet_legacy_id,
      now(),
      now()
    )
    returning id into v_fleet_district_id;
  end if;

  new.district_id := v_fleet_district_id;
  return new;
end;
$$;

drop trigger if exists ensure_delivery_fleet_district_fee
  on public.deliveries;

create trigger ensure_delivery_fleet_district_fee
before insert or update of motorcade_id, district_id
on public.deliveries
for each row
execute function private.ensure_delivery_fleet_district_fee();

revoke all on function private.ensure_delivery_fleet_district_fee()
  from public, anon, authenticated;
