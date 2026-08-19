-- The driver portal header must identify the fleet by its full registered name,
-- rather than the abbreviated badge label used elsewhere in operations screens.
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
