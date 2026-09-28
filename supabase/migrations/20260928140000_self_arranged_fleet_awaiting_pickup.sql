-- 自行叫車 / 自主叫車 skip driver acceptance. Before the meal window they
-- sit at 待取貨 (accepted), not 待接單. After the window they still become 已送達.

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
  v_fulfilled_at timestamptz;
  v_delivery_status text;
  v_delivery_at timestamptz;
  v_delivery_time text;
  v_fleet_changed boolean;
  v_self_arranged boolean;
  v_auto_complete boolean;
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
    delivery.fulfilled_at,
    delivery.delivery_status,
    coalesce(delivery.delivery_at, orders.delivery_at),
    coalesce(delivery.delivery_time, orders.delivery_time)
  into
    v_current_team_id,
    v_fulfilled_at,
    v_delivery_status,
    v_delivery_at,
    v_delivery_time
  from public.deliveries delivery
  left join public.orders orders on orders.id = delivery.order_id
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

  if v_current_team_id is distinct from p_motorcade_id
    and v_fulfilled_at is not null
  then
    raise exception 'delivered orders cannot change fleet';
  end if;

  v_fleet_changed := v_current_team_id is distinct from p_motorcade_id;
  v_self_arranged := coalesce(v_team_name, '') in ('自行叫車', '自主叫車');
  v_window_end := private.delivery_window_end_at(v_delivery_at, v_delivery_time);
  v_auto_complete := v_self_arranged
    and v_window_end is not null
    and now() >= v_window_end;

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

-- Open 自行叫車 / 自主叫車 rows were left at 待接單. Move them to 待取貨.
update public.deliveries delivery
set
  accepted_at = coalesce(delivery.accepted_at, now()),
  driver_confirmation_status = 'accepted',
  delivery_status = '待取貨',
  updated_at = now()
from public.delivery_teams team
where team.id = delivery.motorcade_id
  and team.name in ('自行叫車', '自主叫車')
  and delivery.fulfilled_at is null
  and delivery.taken_at is null
  and coalesce(delivery.delivery_status, '') not in (
    '已取消', '取消', 'Cancelled', '已送達', '己送達', '已取貨', '已取', '待取貨'
  );
