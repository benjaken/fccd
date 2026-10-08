-- 自行叫車 / 自主叫車 used to be marked 已送達 as soon as they were assigned.
-- Those rows still have fulfilled_at set even when the meal window has not
-- ended, and assign_delivery_motorcade then refuses a fleet change. Treat
-- that completion as premature: reopen the row and allow a new fleet.

create or replace function public.assign_delivery_motorcade(
  p_delivery_id uuid,
  p_motorcade_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_team_legacy_id text;
  v_team_name text;
  v_current_team_id uuid;
  v_current_team_name text;
  v_fulfilled_at timestamptz;
  v_delivery_status text;
  v_delivery_at timestamptz;
  v_delivery_time text;
  v_fleet_changed boolean;
  v_self_arranged boolean;
  v_auto_complete boolean;
  v_premature_completion boolean;
  v_window_end timestamptz;
begin
  perform private.lock_material_writes();
  if coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '')
    not in ('Super Admin', 'Admin', 'Accounting', 'Factory')
  then
    raise exception 'not allowed to assign delivery fleet';
  end if;

  select
    delivery.motorcade_id,
    current_team.name,
    delivery.fulfilled_at,
    delivery.delivery_status,
    coalesce(delivery.delivery_at, orders.delivery_at),
    coalesce(delivery.delivery_time, orders.delivery_time)
  into
    v_current_team_id,
    v_current_team_name,
    v_fulfilled_at,
    v_delivery_status,
    v_delivery_at,
    v_delivery_time
  from public.deliveries delivery
  left join public.orders orders on orders.id = delivery.order_id
  left join public.delivery_teams current_team on current_team.id = delivery.motorcade_id
  where delivery.id = p_delivery_id
  for update of delivery;

  if not found then
    raise exception 'delivery not found';
  end if;

  if p_motorcade_id is not null then
    select legacy_id, name
    into v_team_legacy_id, v_team_name
    from public.delivery_teams
    where id = p_motorcade_id
      and is_active = true
      and archived_at is null;

    if not found then
      raise exception 'delivery fleet not found';
    end if;
  end if;

  if p_motorcade_id is not null
    and coalesce(v_delivery_status, '') in ('已取消', '取消', 'Cancelled')
  then
    raise exception 'cancelled orders cannot be assigned to a fleet';
  end if;

  v_window_end := private.delivery_window_end_at(v_delivery_at, v_delivery_time);
  v_self_arranged := coalesce(v_team_name, '') in ('自行叫車', '自主叫車');
  v_auto_complete := v_self_arranged
    and v_window_end is not null
    and now() >= v_window_end;
  v_premature_completion := coalesce(v_current_team_name, '') in ('自行叫車', '自主叫車')
    and v_fulfilled_at is not null
    and (v_window_end is null or now() < v_window_end);

  if v_current_team_id is distinct from p_motorcade_id
    and v_fulfilled_at is not null
    and not v_premature_completion
  then
    raise exception 'delivered orders cannot change fleet';
  end if;

  v_fleet_changed := v_current_team_id is distinct from p_motorcade_id;

  update public.deliveries delivery
  set
    motorcade_id = p_motorcade_id,
    motorcade_legacy_id = v_team_legacy_id,
    subdriver_id = case
      when v_fleet_changed then null
      else delivery.subdriver_id
    end,
    subdriver_legacy_id = case
      when v_fleet_changed then null
      else delivery.subdriver_legacy_id
    end,
    accepted_at = case
      when v_auto_complete or v_self_arranged then coalesce(delivery.accepted_at, now())
      when v_fleet_changed then null
      else delivery.accepted_at
    end,
    taken_at = case
      when v_auto_complete then coalesce(delivery.taken_at, now())
      when v_self_arranged then null
      when v_fleet_changed then null
      else delivery.taken_at
    end,
    fulfilled_at = case
      when v_auto_complete then coalesce(delivery.fulfilled_at, now())
      when v_self_arranged or v_premature_completion or v_fleet_changed then null
      else delivery.fulfilled_at
    end,
    driver_confirmation_status = case
      when v_auto_complete or v_self_arranged then 'accepted'
      when not v_fleet_changed then delivery.driver_confirmation_status
      when p_motorcade_id is null then null
      else 'pending'
    end,
    delivery_status = case
      when v_auto_complete then '已送達'
      when v_self_arranged then '待取貨'
      when not v_fleet_changed then delivery.delivery_status
      when p_motorcade_id is null then '未派車隊'
      else '待接單'
    end,
    updated_at = now()
  where delivery.id = p_delivery_id;

  if p_motorcade_id is not null then
    delete from private.driver_delivery_rejections
    where delivery_id = p_delivery_id
      and delivery_team_id = p_motorcade_id;
  end if;
end;
$$;

-- Reopen self-arranged rows completed before their Hong Kong meal window.
update public.deliveries delivery
set
  taken_at = null,
  fulfilled_at = null,
  accepted_at = coalesce(delivery.accepted_at, now()),
  driver_confirmation_status = 'accepted',
  delivery_status = '待取貨',
  updated_at = now()
from (
  select open_delivery.id
  from public.deliveries open_delivery
  join public.delivery_teams team on team.id = open_delivery.motorcade_id
  left join public.orders orders on orders.id = open_delivery.order_id
  where team.name in ('自行叫車', '自主叫車')
    and open_delivery.fulfilled_at is not null
    and coalesce(open_delivery.delivery_status, '') in ('已送達', '己送達')
    and (
      private.delivery_window_end_at(
        coalesce(open_delivery.delivery_at, orders.delivery_at),
        coalesce(open_delivery.delivery_time, orders.delivery_time)
      ) is null
      or now() < private.delivery_window_end_at(
        coalesce(open_delivery.delivery_at, orders.delivery_at),
        coalesce(open_delivery.delivery_time, orders.delivery_time)
      )
    )
) premature
where delivery.id = premature.id;
