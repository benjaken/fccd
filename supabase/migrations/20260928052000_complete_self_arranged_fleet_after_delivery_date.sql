-- 自行叫車 / 自主叫車 skips driver accept and pickup, but it is not delivered
-- until the Hong Kong delivery date has passed. Future assignments stay at
-- 待接單; a daily job marks them 已送達 after that date.

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
  v_service_at timestamptz;
  v_fleet_changed boolean;
  v_delivery_passed boolean;
  v_auto_complete boolean;
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
    coalesce(delivery.delivery_at, orders.delivery_at)
  into v_current_team_id, v_fulfilled_at, v_delivery_status, v_service_at
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
  v_delivery_passed := v_service_at is not null
    and (v_service_at at time zone 'Asia/Hong_Kong')::date
      < (timezone('Asia/Hong_Kong', now()))::date;
  v_auto_complete := coalesce(v_team_name, '') in ('自行叫車', '自主叫車')
    and v_delivery_passed;

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
      when v_auto_complete then coalesce(delivery.accepted_at, now())
      when v_fleet_changed then null
      else delivery.accepted_at
    end,
    taken_at = case
      when v_auto_complete then coalesce(delivery.taken_at, now())
      when v_fleet_changed then null
      else delivery.taken_at
    end,
    fulfilled_at = case
      when v_auto_complete then coalesce(delivery.fulfilled_at, now())
      else delivery.fulfilled_at
    end,
    driver_confirmation_status = case
      when v_auto_complete then 'accepted'
      when not v_fleet_changed then delivery.driver_confirmation_status
      when p_motorcade_id is null then null
      else 'pending'
    end,
    delivery_status = case
      when v_auto_complete then '已送達'
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

create or replace function public.complete_past_self_arranged_deliveries(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  completed_count integer;
begin
  perform private.lock_material_writes();

  update public.deliveries delivery
  set
    accepted_at = coalesce(delivery.accepted_at, p_now),
    taken_at = coalesce(delivery.taken_at, p_now),
    fulfilled_at = coalesce(delivery.fulfilled_at, p_now),
    driver_confirmation_status = 'accepted',
    delivery_status = '已送達',
    updated_at = p_now
  from public.delivery_teams team
  where team.id = delivery.motorcade_id
    and team.name in ('自行叫車', '自主叫車')
    and delivery.fulfilled_at is null
    and coalesce(
      delivery.delivery_at,
      (select orders.delivery_at from public.orders orders where orders.id = delivery.order_id)
    ) is not null
    and (
      coalesce(
        delivery.delivery_at,
        (select orders.delivery_at from public.orders orders where orders.id = delivery.order_id)
      ) at time zone 'Asia/Hong_Kong'
    )::date < (p_now at time zone 'Asia/Hong_Kong')::date
    and coalesce(delivery.delivery_status, '') not in ('已取消', '取消', 'Cancelled');

  get diagnostics completed_count = row_count;
  return completed_count;
end;
$$;

revoke all on function public.complete_past_self_arranged_deliveries(timestamptz)
  from public, anon, authenticated;

do $$
declare
  v_job bigint;
begin
  select jobid into v_job
  from cron.job
  where jobname = 'fccd-complete-past-self-arranged-deliveries';

  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
end
$$;

-- 00:05 Asia/Hong_Kong. pg_cron uses UTC.
select cron.schedule(
  'fccd-complete-past-self-arranged-deliveries',
  '5 16 * * *',
  $$select public.complete_past_self_arranged_deliveries()$$
);

select public.complete_past_self_arranged_deliveries();
