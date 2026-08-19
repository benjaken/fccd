-- Allow fleet and income reports to be limited to an inclusive delivery-date range.

drop function if exists public.driver_delivery_fleet_summary(uuid, uuid);
create function public.driver_delivery_fleet_summary(
  p_session_token uuid,
  p_driver_id uuid default null,
  p_start_date date default null,
  p_end_date date default null
)
returns table(month_start date, order_count bigint, completed_count bigint, total_fee numeric)
language sql stable security definer set search_path = public, private as $$
  select date_trunc('month', d.delivery_at at time zone 'Asia/Hong_Kong')::date,
    count(*), count(*) filter (where d.fulfilled_at is not null), coalesce(sum(d.total_fee), 0)
  from private.driver_delivery_sessions session
  join public.deliveries d on d.motorcade_id = session.delivery_team_id
  where session.token = p_session_token and session.expires_at > now()
    and d.subdriver_legacy_id is not null
    and (p_driver_id is null or d.subdriver_legacy_id = (select legacy_id from public.delivery_team_drivers where id = p_driver_id))
    and (p_start_date is null or (d.delivery_at at time zone 'Asia/Hong_Kong')::date >= p_start_date)
    and (p_end_date is null or (d.delivery_at at time zone 'Asia/Hong_Kong')::date <= p_end_date)
  group by 1 order by 1 desc;
$$;

drop function if exists public.driver_delivery_fleet_days(uuid, date, uuid);
create function public.driver_delivery_fleet_days(
  p_session_token uuid,
  p_month_start date,
  p_driver_id uuid default null,
  p_start_date date default null,
  p_end_date date default null
)
returns table(delivery_date date, order_count bigint, total_fee numeric)
language sql stable security definer set search_path = public, private as $$
  select (d.delivery_at at time zone 'Asia/Hong_Kong')::date, count(*), coalesce(sum(d.total_fee), 0)
  from private.driver_delivery_sessions session
  join public.deliveries d on d.motorcade_id = session.delivery_team_id
  where session.token = p_session_token and session.expires_at > now()
    and d.subdriver_legacy_id is not null
    and (p_driver_id is null or d.subdriver_legacy_id = (select legacy_id from public.delivery_team_drivers where id = p_driver_id))
    and (d.delivery_at at time zone 'Asia/Hong_Kong')::date >= p_month_start
    and (d.delivery_at at time zone 'Asia/Hong_Kong')::date < (p_month_start + interval '1 month')::date
    and (p_start_date is null or (d.delivery_at at time zone 'Asia/Hong_Kong')::date >= p_start_date)
    and (p_end_date is null or (d.delivery_at at time zone 'Asia/Hong_Kong')::date <= p_end_date)
  group by 1 order by 1;
$$;

drop function if exists public.driver_delivery_income_summary(uuid);
create function public.driver_delivery_income_summary(
  p_session_token uuid,
  p_start_date date default null,
  p_end_date date default null
)
returns table(month_start date, order_count bigint, completed_count bigint, total_fee numeric)
language sql stable security definer set search_path = public, private as $$
  select date_trunc('month', d.delivery_at at time zone 'Asia/Hong_Kong')::date,
    count(*), count(*) filter (where d.fulfilled_at is not null), coalesce(sum(d.total_fee), 0)
  from private.driver_delivery_sessions session
  join public.deliveries d on d.motorcade_id = session.delivery_team_id
  where session.token = p_session_token and session.expires_at > now()
    and (p_start_date is null or (d.delivery_at at time zone 'Asia/Hong_Kong')::date >= p_start_date)
    and (p_end_date is null or (d.delivery_at at time zone 'Asia/Hong_Kong')::date <= p_end_date)
  group by 1 order by 1 desc;
$$;

drop function if exists public.driver_delivery_income_days(uuid, date);
create function public.driver_delivery_income_days(
  p_session_token uuid,
  p_month_start date,
  p_start_date date default null,
  p_end_date date default null
)
returns table(delivery_date date, order_count bigint, total_fee numeric)
language sql stable security definer set search_path = public, private as $$
  select (d.delivery_at at time zone 'Asia/Hong_Kong')::date, count(*), coalesce(sum(d.total_fee), 0)
  from private.driver_delivery_sessions session
  join public.deliveries d on d.motorcade_id = session.delivery_team_id
  where session.token = p_session_token and session.expires_at > now()
    and (d.delivery_at at time zone 'Asia/Hong_Kong')::date >= p_month_start
    and (d.delivery_at at time zone 'Asia/Hong_Kong')::date < (p_month_start + interval '1 month')::date
    and (p_start_date is null or (d.delivery_at at time zone 'Asia/Hong_Kong')::date >= p_start_date)
    and (p_end_date is null or (d.delivery_at at time zone 'Asia/Hong_Kong')::date <= p_end_date)
  group by 1 order by 1;
$$;

grant execute on function public.driver_delivery_fleet_summary(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.driver_delivery_fleet_days(uuid, date, uuid, date, date) to anon, authenticated;
grant execute on function public.driver_delivery_income_summary(uuid, date, date) to anon, authenticated;
grant execute on function public.driver_delivery_income_days(uuid, date, date, date) to anon, authenticated;
