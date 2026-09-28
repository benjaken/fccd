-- 自行叫車 / 自主叫車 still skip driver accept/pickup, but 已送達 is only
-- valid after the Hong Kong delivery window ends. Revert premature rows from
-- 20260928123000 and complete remaining open rows once the meal time has passed.

create or replace function private.delivery_window_end_at(
  p_delivery_at timestamptz,
  p_delivery_time text
)
returns timestamptz
language plpgsql
stable
set search_path = public, private, pg_catalog
as $$
declare
  v_date date;
  v_match text[];
  v_hour integer;
  v_minute integer;
  v_meridiem text;
begin
  if p_delivery_at is null then
    return null;
  end if;

  v_date := (p_delivery_at at time zone 'Asia/Hong_Kong')::date;
  v_match := regexp_match(
    coalesce(p_delivery_time, ''),
    '([0-9]{1,2})(?::([0-9]{2}))?[[:space:]]*([AaPp][Mm])?[^0-9]*$'
  );

  if v_match is null then
    return (v_date + time '23:59:59') at time zone 'Asia/Hong_Kong';
  end if;

  v_hour := v_match[1]::integer;
  v_minute := coalesce(nullif(v_match[2], ''), '0')::integer;
  v_meridiem := lower(coalesce(v_match[3], ''));

  if v_minute < 0 or v_minute > 59 then
    return (v_date + time '23:59:59') at time zone 'Asia/Hong_Kong';
  end if;

  if v_meridiem <> '' then
    if v_hour < 1 or v_hour > 12 then
      return (v_date + time '23:59:59') at time zone 'Asia/Hong_Kong';
    end if;
    if v_meridiem = 'am' and v_hour = 12 then
      v_hour := 0;
    end if;
    if v_meridiem = 'pm' and v_hour < 12 then
      v_hour := v_hour + 12;
    end if;
  elsif v_hour < 0 or v_hour > 23 then
    return (v_date + time '23:59:59') at time zone 'Asia/Hong_Kong';
  end if;

  return (v_date + make_time(v_hour, v_minute, 0)) at time zone 'Asia/Hong_Kong';
end;
$$;

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
  v_window_end := private.delivery_window_end_at(v_delivery_at, v_delivery_time);
  v_auto_complete := coalesce(v_team_name, '') in ('自行叫車', '自主叫車')
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

create or replace function public.complete_due_self_arranged_deliveries(
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
  from public.delivery_teams team, public.orders orders
  where team.id = delivery.motorcade_id
    and orders.id = delivery.order_id
    and team.name in ('自行叫車', '自主叫車')
    and delivery.fulfilled_at is null
    and coalesce(delivery.delivery_status, '') not in ('已取消', '取消', 'Cancelled')
    and private.delivery_window_end_at(
      coalesce(delivery.delivery_at, orders.delivery_at),
      coalesce(delivery.delivery_time, orders.delivery_time)
    ) is not null
    and p_now >= private.delivery_window_end_at(
      coalesce(delivery.delivery_at, orders.delivery_at),
      coalesce(delivery.delivery_time, orders.delivery_time)
    );

  get diagnostics completed_count = row_count;
  return completed_count;
end;
$$;

comment on function public.complete_due_self_arranged_deliveries(timestamptz) is
  'Marks 自行叫車 / 自主叫車 deliveries as 已送達 after their Hong Kong delivery window ends.';

revoke all on function public.complete_due_self_arranged_deliveries(timestamptz)
  from public, anon, authenticated;

drop function if exists public.complete_past_self_arranged_deliveries(timestamptz);

-- Put not-yet-due self-arranged rows back to 待接單.
update public.deliveries delivery
set
  accepted_at = null,
  taken_at = null,
  fulfilled_at = null,
  driver_confirmation_status = 'pending',
  delivery_status = '待接單',
  updated_at = now()
from public.delivery_teams team, public.orders orders
where team.id = delivery.motorcade_id
  and orders.id = delivery.order_id
  and team.name in ('自行叫車', '自主叫車')
  and delivery.delivery_status in ('已送達', '己送達')
  and (
    private.delivery_window_end_at(
      coalesce(delivery.delivery_at, orders.delivery_at),
      coalesce(delivery.delivery_time, orders.delivery_time)
    ) is null
    or now() < private.delivery_window_end_at(
      coalesce(delivery.delivery_at, orders.delivery_at),
      coalesce(delivery.delivery_time, orders.delivery_time)
    )
  );

select public.complete_due_self_arranged_deliveries();

do $$
declare
  v_job bigint;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in (
      'fccd-complete-due-self-arranged-deliveries',
      'fccd-complete-past-self-arranged-deliveries'
    )
  loop
    perform cron.unschedule(v_job);
  end loop;
end
$$;

select cron.schedule(
  'fccd-complete-due-self-arranged-deliveries',
  '*/5 * * * *',
  $$select public.complete_due_self_arranged_deliveries()$$
);
