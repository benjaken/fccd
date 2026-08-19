-- When a fleet accepts an order, default an unassigned driver to that fleet's contact person.
create or replace function public.driver_delivery_accept_order(
  p_session_token uuid,
  p_delivery_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_team public.delivery_teams%rowtype;
  v_driver_id uuid;
  v_driver_legacy_id text;
  v_contact_legacy_id text;
begin
  select team.* into v_team
  from private.driver_delivery_sessions session
  join public.delivery_teams team on team.id = session.delivery_team_id
  where session.token = p_session_token
    and session.expires_at > now();

  if v_team.id is null then
    raise exception 'invalid driver session';
  end if;

  if nullif(btrim(v_team.contact_person), '') is not null then
    v_contact_legacy_id := 'driver-portal-contact:' || v_team.id::text;
    select driver.id, driver.legacy_id into v_driver_id, v_driver_legacy_id
    from public.delivery_team_drivers driver
    where driver.delivery_team_id = v_team.id
      and (
        driver.legacy_id = v_contact_legacy_id
        or (driver.is_active and lower(btrim(driver.display_name)) = lower(btrim(v_team.contact_person)))
      )
    order by (driver.legacy_id = v_contact_legacy_id) desc
    limit 1;

    if v_driver_id is null then
      insert into public.delivery_team_drivers (
        legacy_id, delivery_team_id, delivery_team_legacy_id, display_name, is_active
      ) values (
        v_contact_legacy_id, v_team.id, v_team.legacy_id, btrim(v_team.contact_person), true
      )
      returning id, legacy_id into v_driver_id, v_driver_legacy_id;
    end if;
  end if;

  update public.deliveries delivery
  set
    delivery_status = '待取貨',
    taken_at = now(),
    subdriver_id = coalesce(delivery.subdriver_id, v_driver_id),
    subdriver_legacy_id = coalesce(delivery.subdriver_legacy_id, v_driver_legacy_id),
    updated_at = now()
  where delivery.id = p_delivery_id
    and delivery.motorcade_id = v_team.id
    and delivery.taken_at is null
    and not exists (
      select 1 from private.driver_delivery_rejections rejection
      where rejection.delivery_id = delivery.id
        and rejection.delivery_team_id = v_team.id
    );

  if not found then
    raise exception 'delivery is not available';
  end if;
end;
$$;

grant execute on function public.driver_delivery_accept_order(uuid, uuid) to anon, authenticated;
