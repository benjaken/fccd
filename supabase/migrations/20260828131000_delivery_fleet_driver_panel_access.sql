-- Let operations control driver-portal access independently from whether a
-- fleet is available for assignment. Existing fleets remain enabled.

alter table public.delivery_teams
  add column if not exists driver_panel_enabled boolean not null default true;

comment on column public.delivery_teams.driver_panel_enabled is
  'Whether this fleet may sign in to and use the driver delivery portal.';

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
  driver_panel_enabled boolean,
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
    team.driver_panel_enabled,
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

drop function if exists public.save_delivery_fleet(uuid, text, text, text, text, text, boolean, text);
drop function if exists public.save_delivery_fleet(uuid, text, text, text, text, text, boolean, text, boolean);

create function public.save_delivery_fleet(
  p_fleet_id uuid,
  p_name text,
  p_short_name text,
  p_contact_person text,
  p_contact_number text,
  p_bank_account text,
  p_is_active boolean,
  p_login_code text,
  p_driver_panel_enabled boolean
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
  driver_panel_enabled boolean,
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
      status, is_active, login_code, driver_panel_enabled,
      bubble_created_at, bubble_modified_at
    ) values (
      'web-delivery-team-' || gen_random_uuid()::text,
      btrim(p_name), nullif(btrim(p_short_name), ''),
      nullif(btrim(p_contact_person), ''), nullif(btrim(p_contact_number), ''),
      nullif(btrim(p_bank_account), ''),
      case when coalesce(p_is_active, true) then 'active' else 'inactive' end,
      coalesce(p_is_active, true), v_login_code,
      coalesce(p_driver_panel_enabled, true), now(), now()
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
        driver_panel_enabled = coalesce(p_driver_panel_enabled, true),
        bubble_modified_at = now(),
        updated_at = now()
    where team.id = p_fleet_id and team.archived_at is null
    returning team.id into v_fleet_id;
    if v_fleet_id is null then
      raise exception 'fleet_not_found' using errcode = 'P0002';
    end if;
  end if;

  if not coalesce(p_driver_panel_enabled, true) then
    delete from private.driver_delivery_sessions
    where delivery_team_id = v_fleet_id;
  end if;

  return query
  select team.id, team.name, team.short_name, team.contact_person,
    team.contact_number, team.bank_account, team.status, team.is_active,
    team.driver_panel_enabled, team.created_at,
    nullif(btrim(team.login_code), '') is not null
  from public.delivery_teams as team
  where team.id = v_fleet_id;
end;
$$;

create or replace function public.driver_delivery_login(p_login_code text)
returns table(session_token uuid, team_id uuid, team_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_team public.delivery_teams%rowtype;
  v_session private.driver_delivery_sessions%rowtype;
begin
  if nullif(btrim(p_login_code), '') is null then
    return;
  end if;

  select * into v_team
  from public.delivery_teams
  where login_code = btrim(p_login_code)
    and is_active = true
    and driver_panel_enabled = true
    and archived_at is null
  limit 1;

  if not found then
    perform pg_sleep(0.15);
    return;
  end if;

  delete from private.driver_delivery_sessions as sessions
  where sessions.expires_at <= now();
  insert into private.driver_delivery_sessions (delivery_team_id)
  values (v_team.id)
  returning * into v_session;

  return query select v_session.token, v_team.id, v_team.name, v_session.expires_at;
end;
$$;

revoke all on function public.delivery_fleet_management_list(text) from public, anon;
revoke all on function public.save_delivery_fleet(uuid, text, text, text, text, text, boolean, text, boolean) from public, anon;
revoke all on function public.driver_delivery_login(text) from public;
grant execute on function public.delivery_fleet_management_list(text) to authenticated;
grant execute on function public.save_delivery_fleet(uuid, text, text, text, text, text, boolean, text, boolean) to authenticated;
grant execute on function public.driver_delivery_login(text) to anon, authenticated;
