-- Extend fleet master data with bank accounts and manage the existing
-- fleet-to-district default fees from the fleet management page.

alter table public.delivery_teams
  add column if not exists bank_account text;

drop function if exists public.delivery_fleet_management_list(text);

create function public.delivery_fleet_management_list(p_search text default null)
returns table (
  id uuid,
  name text,
  short_name text,
  contact_person text,
  contact_number text,
  bank_account text,
  status text,
  is_active boolean,
  created_at timestamptz,
  has_login_code boolean
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
  select
    team.id,
    team.name,
    team.short_name,
    team.contact_person,
    team.contact_number,
    team.bank_account,
    team.status,
    team.is_active,
    team.created_at,
    nullif(btrim(team.login_code), '') is not null
  from public.delivery_teams as team
  where team.archived_at is null
    and (
      nullif(btrim(p_search), '') is null
      or team.name ilike '%' || btrim(p_search) || '%'
      or coalesce(team.short_name, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(team.contact_person, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(team.contact_number, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(team.bank_account, '') ilike '%' || btrim(p_search) || '%'
    )
  order by team.is_active desc, team.name;
end;
$$;

drop function if exists public.save_delivery_fleet(uuid, text, text, text, text, boolean, text);

create function public.save_delivery_fleet(
  p_fleet_id uuid,
  p_name text,
  p_short_name text,
  p_contact_person text,
  p_contact_number text,
  p_bank_account text,
  p_is_active boolean,
  p_login_code text
)
returns table (
  id uuid,
  name text,
  short_name text,
  contact_person text,
  contact_number text,
  bank_account text,
  status text,
  is_active boolean,
  created_at timestamptz,
  has_login_code boolean
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_fleet_id uuid;
  v_login_code text := nullif(btrim(p_login_code), '');
begin
  if not private.has_page_manage('delivery.fleets') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if p_fleet_id is null and v_login_code is null then
    raise exception 'login_code_required' using errcode = '22023';
  end if;
  if v_login_code is not null and exists (
    select 1 from public.delivery_teams as existing
    where existing.login_code = v_login_code
      and existing.id is distinct from p_fleet_id
      and existing.archived_at is null
  ) then
    raise exception 'login_code_in_use' using errcode = '23505';
  end if;

  if p_fleet_id is null then
    insert into public.delivery_teams as inserted (
      legacy_id, name, short_name, contact_person, contact_number, bank_account,
      status, is_active, login_code, bubble_created_at, bubble_modified_at
    ) values (
      'web-delivery-team-' || gen_random_uuid()::text,
      btrim(p_name), nullif(btrim(p_short_name), ''),
      nullif(btrim(p_contact_person), ''), nullif(btrim(p_contact_number), ''),
      nullif(btrim(p_bank_account), ''),
      case when coalesce(p_is_active, true) then 'active' else 'inactive' end,
      coalesce(p_is_active, true), v_login_code, now(), now()
    ) returning inserted.id into v_fleet_id;
  else
    update public.delivery_teams as team
    set name = btrim(p_name),
        short_name = nullif(btrim(p_short_name), ''),
        contact_person = nullif(btrim(p_contact_person), ''),
        contact_number = nullif(btrim(p_contact_number), ''),
        bank_account = nullif(btrim(p_bank_account), ''),
        status = case when coalesce(p_is_active, true) then 'active' else 'inactive' end,
        is_active = coalesce(p_is_active, true),
        login_code = coalesce(v_login_code, team.login_code),
        bubble_modified_at = now(),
        updated_at = now()
    where team.id = p_fleet_id and team.archived_at is null
    returning team.id into v_fleet_id;
    if v_fleet_id is null then
      raise exception 'fleet_not_found' using errcode = 'P0002';
    end if;
  end if;

  return query
  select team.id, team.name, team.short_name, team.contact_person,
    team.contact_number, team.bank_account, team.status, team.is_active,
    team.created_at, nullif(btrim(team.login_code), '') is not null
  from public.delivery_teams as team
  where team.id = v_fleet_id;
end;
$$;

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
  where team.id = p_fleet_id
    and team.archived_at is null
    and district.archived_at is null
  order by district.name;
end;
$$;

create or replace function public.save_delivery_fleet_fee(
  p_district_id uuid,
  p_fee numeric
)
returns table (
  district_id uuid,
  fleet_id uuid,
  fleet_name text,
  district_name text,
  fee numeric
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_manage('delivery.fleets') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if p_fee is null or p_fee < 0 then
    raise exception 'fee_invalid' using errcode = '22023';
  end if;

  update public.delivery_districts as district
  set default_fee = p_fee,
      bubble_modified_at = now(),
      updated_at = now()
  where district.id = p_district_id
    and district.driver_team_id is not null
    and district.archived_at is null;

  if not found then
    raise exception 'fleet_district_not_found' using errcode = 'P0002';
  end if;

  return query
  select district.id, team.id, team.name, district.name,
    coalesce(district.default_fee, 0)::numeric
  from public.delivery_districts as district
  join public.delivery_teams as team on team.id = district.driver_team_id
  where district.id = p_district_id
    and team.archived_at is null;
end;
$$;

revoke all on function public.delivery_fleet_management_list(text) from public, anon;
revoke all on function public.save_delivery_fleet(uuid, text, text, text, text, text, boolean, text) from public, anon;
revoke all on function public.delivery_fleet_fee_list(uuid) from public, anon;
revoke all on function public.save_delivery_fleet_fee(uuid, numeric) from public, anon;
grant execute on function public.delivery_fleet_management_list(text) to authenticated;
grant execute on function public.save_delivery_fleet(uuid, text, text, text, text, text, boolean, text) to authenticated;
grant execute on function public.delivery_fleet_fee_list(uuid) to authenticated;
grant execute on function public.save_delivery_fleet_fee(uuid, numeric) to authenticated;
