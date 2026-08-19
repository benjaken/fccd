-- Operations assigns a fleet only. The fleet assigns its own driver later.
create or replace function public.assign_delivery_motorcade(
  p_delivery_id uuid,
  p_motorcade_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_legacy_id text;
begin
  if ((select auth.jwt()) -> 'app_metadata' ->> 'role')
    not in ('Super Admin', 'Admin', 'Accounting', 'Factory')
  then
    raise exception 'not allowed to assign delivery fleet';
  end if;

  if p_motorcade_id is not null then
    select legacy_id into v_team_legacy_id
    from public.delivery_teams
    where id = p_motorcade_id
      and is_active = true
      and archived_at is null;

    if not found then
      raise exception 'delivery fleet not found';
    end if;
  end if;

  update public.deliveries
  set
    motorcade_id = p_motorcade_id,
    motorcade_legacy_id = v_team_legacy_id,
    subdriver_id = null,
    subdriver_legacy_id = null,
    updated_at = now()
  where id = p_delivery_id;

  if not found then
    raise exception 'delivery not found';
  end if;
end;
$$;

grant execute on function public.assign_delivery_motorcade(uuid, uuid) to authenticated;
