create table if not exists private.driver_delivery_sessions (
  token uuid primary key default gen_random_uuid(),
  delivery_team_id uuid not null references public.delivery_teams(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now()
);

create index if not exists driver_delivery_sessions_expires_at_idx
  on private.driver_delivery_sessions (expires_at);

revoke all on private.driver_delivery_sessions from public, anon, authenticated;

create table if not exists private.driver_delivery_rejections (
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  delivery_team_id uuid not null references public.delivery_teams(id) on delete cascade,
  rejected_at timestamptz not null default now(),
  primary key(delivery_id,delivery_team_id)
);
revoke all on private.driver_delivery_rejections from public,anon,authenticated;

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

  return query select v_session.token, v_team.id,
    coalesce(nullif(btrim(v_team.short_name), ''), v_team.name), v_session.expires_at;
end;
$$;

drop function if exists public.driver_delivery_available_orders(uuid, date, text);

create function public.driver_delivery_available_orders(
  p_session_token uuid,
  p_delivery_date date,
  p_search text default null
)
returns table(
  delivery_id uuid,
  order_number text,
  ship_out_time text,
  delivery_time text,
  address text,
  district_name text,
  shipping_method text
  ,warning_text text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    d.id,
    o.order_number,
    coalesce(nullif(btrim(d.ship_out_time), ''), nullif(btrim(o.ship_out_time), '')),
    coalesce(nullif(btrim(d.delivery_time), ''), nullif(btrim(o.delivery_time), '')),
    o.shipping_address_snapshot,
    dd.name,
    coalesce(sm.display_name, sm.name),
    coalesce(nullif(btrim(o.factory_packing_note), ''), nullif(btrim(o.remarks), ''))
  from private.driver_delivery_sessions s
  join public.deliveries d
    on (d.motorcade_id = s.delivery_team_id
      or (d.motorcade_id is null and exists (
        select 1 from public.delivery_districts assigned
        where assigned.id = d.district_id
          and assigned.driver_team_id = s.delivery_team_id
      )))
  join public.orders o on o.id = d.order_id
  left join public.delivery_districts dd on dd.id = d.district_id
  left join public.shipping_methods sm on sm.id = coalesce(d.shipping_method_id, o.shipping_method_id)
  where s.token = p_session_token
    and s.expires_at > now()
    and (d.delivery_at at time zone 'Asia/Hong_Kong')::date = p_delivery_date
    and d.motorcade_id is null
    and d.taken_at is null
    and not exists(select 1 from private.driver_delivery_rejections rejection where rejection.delivery_id=d.id and rejection.delivery_team_id=s.delivery_team_id)
    and coalesce(d.delivery_status, o.delivery_status, '') not in ('已取消', '取消', 'Cancelled')
    and (
      nullif(btrim(p_search), '') is null
      or coalesce(o.order_number, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(o.shipping_address_snapshot, '') ilike '%' || btrim(p_search) || '%'
    )
  order by d.delivery_at, o.order_number;
$$;

create or replace function public.driver_delivery_reject_order(p_session_token uuid,p_delivery_id uuid)
returns void language plpgsql security definer set search_path=public,private as $$
declare v_team_id uuid;
begin
  select session.delivery_team_id into v_team_id from private.driver_delivery_sessions session where session.token=p_session_token and session.expires_at>now();
  if v_team_id is null then raise exception 'invalid driver session'; end if;
  if not exists(select 1 from public.deliveries d where d.id=p_delivery_id and d.taken_at is null and (d.motorcade_id=v_team_id or (d.motorcade_id is null and exists(select 1 from public.delivery_districts district where district.id=d.district_id and district.driver_team_id=v_team_id)))) then raise exception 'delivery is not available'; end if;
  insert into private.driver_delivery_rejections(delivery_id,delivery_team_id) values(p_delivery_id,v_team_id) on conflict do nothing;
  update public.deliveries set motorcade_id=null,motorcade_legacy_id=null,subdriver_id=null,subdriver_legacy_id=null,updated_at=now() where id=p_delivery_id and motorcade_id=v_team_id;
end; $$;

create or replace function public.driver_delivery_accept_order(p_session_token uuid,p_delivery_id uuid)
returns void language plpgsql security definer set search_path=public,private as $$
declare v_team_id uuid;v_team_legacy text;
begin
select session.delivery_team_id,team.legacy_id into v_team_id,v_team_legacy from private.driver_delivery_sessions session join public.delivery_teams team on team.id=session.delivery_team_id where session.token=p_session_token and session.expires_at>now();
if v_team_id is null then raise exception 'invalid driver session';end if;
update public.deliveries d set motorcade_id=v_team_id,motorcade_legacy_id=v_team_legacy,delivery_status='待取貨',updated_at=now()
where d.id=p_delivery_id and d.motorcade_id is null and d.taken_at is null and exists(select 1 from public.delivery_districts district where district.id=d.district_id and district.driver_team_id=v_team_id)
and not exists(select 1 from private.driver_delivery_rejections rejection where rejection.delivery_id=d.id and rejection.delivery_team_id=v_team_id);
if not found then raise exception 'delivery is not available';end if;
end;$$;

drop function if exists public.driver_delivery_accepted_order_details(uuid,date,text);
create function public.driver_delivery_accepted_order_details(p_session_token uuid,p_delivery_date date,p_search text default null)
returns table(delivery_id uuid,order_number text,ship_out_time text,delivery_time text,address text,district_name text,shipping_method text,warning_text text,customer_name text,customer_phone text,basic_fee numeric,total_fee numeric,taken_at timestamptz,fulfilled_at timestamptz,driver_id uuid,driver_name text,surcharges jsonb,images text[])
language sql stable security definer set search_path=public,private as $$
select d.id,o.order_number,coalesce(d.ship_out_time,o.ship_out_time),coalesce(d.delivery_time,o.delivery_time),o.shipping_address_snapshot,district.name,coalesce(method.display_name,method.name),coalesce(nullif(btrim(o.factory_packing_note),''),nullif(btrim(o.remarks),'')),o.customer_name_snapshot,
case when nullif(btrim(o.contact_number_a_snapshot),'') is not null and nullif(btrim(o.contact_number_b_snapshot),'') is not null and btrim(o.contact_number_a_snapshot)<>btrim(o.contact_number_b_snapshot) then btrim(o.contact_number_a_snapshot)||' / '||btrim(o.contact_number_b_snapshot) else coalesce(nullif(btrim(o.contact_number_a_snapshot),''),nullif(btrim(o.contact_number_b_snapshot),'')) end,
coalesce(d.basic_fee,0),coalesce(d.total_fee,0),d.taken_at,d.fulfilled_at,driver.id,driver.display_name,
coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',st.name,'amount',coalesce(s.amount,0)) order by s.created_at) from public.delivery_surcharges s join public.delivery_surcharge_types st on st.id=s.surcharge_type_id where s.delivery_id=d.id),'[]'::jsonb),coalesce(d.image_references,'{}')
from private.driver_delivery_sessions session join public.deliveries d on d.motorcade_id=session.delivery_team_id join public.orders o on o.id=d.order_id
left join public.delivery_districts district on district.id=d.district_id left join public.shipping_methods method on method.id=coalesce(d.shipping_method_id,o.shipping_method_id)
left join public.delivery_team_drivers driver on driver.legacy_id=d.subdriver_legacy_id and driver.delivery_team_id=session.delivery_team_id
where session.token=p_session_token and session.expires_at>now() and (d.delivery_at at time zone 'Asia/Hong_Kong')::date=p_delivery_date
and(nullif(btrim(p_search),'')is null or coalesce(o.order_number,'')ilike'%'||btrim(p_search)||'%' or coalesce(o.shipping_address_snapshot,'')ilike'%'||btrim(p_search)||'%') order by d.delivery_at,o.order_number;$$;

create or replace function public.driver_delivery_pickup_order(p_session_token uuid,p_delivery_id uuid)
returns void language plpgsql security definer set search_path=public,private as $$
declare v_team_id uuid;begin select delivery_team_id into v_team_id from private.driver_delivery_sessions where token=p_session_token and expires_at>now();if v_team_id is null then raise exception'invalid driver session';end if;
update public.deliveries set taken_at=now(),delivery_status='已取貨',updated_at=now() where id=p_delivery_id and motorcade_id=v_team_id and taken_at is null and fulfilled_at is null;if not found then raise exception'order cannot be picked up';end if;end;$$;

create or replace function public.driver_delivery_deliver_order(p_session_token uuid,p_delivery_id uuid)
returns void language plpgsql security definer set search_path=public,private as $$
declare v_team_id uuid;begin select delivery_team_id into v_team_id from private.driver_delivery_sessions where token=p_session_token and expires_at>now();if v_team_id is null then raise exception'invalid driver session';end if;
update public.deliveries set fulfilled_at=now(),delivery_status='已送達',updated_at=now() where id=p_delivery_id and motorcade_id=v_team_id and taken_at is not null and fulfilled_at is null;if not found then raise exception'order must be picked up before delivery';end if;end;$$;

create or replace function public.driver_delivery_assign_driver(p_session_token uuid,p_delivery_id uuid,p_driver_id uuid)
returns void language plpgsql security definer set search_path=public,private as $$
declare v_team_id uuid;v_driver_legacy text;
begin
select delivery_team_id into v_team_id from private.driver_delivery_sessions where token=p_session_token and expires_at>now();
select legacy_id into v_driver_legacy from public.delivery_team_drivers where id=p_driver_id and delivery_team_id=v_team_id and is_active=true;
if v_team_id is null or v_driver_legacy is null then raise exception'invalid driver assignment';end if;
update public.deliveries set subdriver_id=p_driver_id,subdriver_legacy_id=v_driver_legacy,updated_at=now() where id=p_delivery_id and motorcade_id=v_team_id and fulfilled_at is null;
if not found then raise exception'delivery not found or already completed';end if;
end;$$;

create or replace function public.driver_delivery_team_drivers(p_session_token uuid)
returns table(driver_id uuid, driver_name text)
language sql stable security definer
set search_path = public, private
as $$
  select driver.id, driver.display_name
  from private.driver_delivery_sessions session
  join public.delivery_team_drivers driver
    on driver.delivery_team_id = session.delivery_team_id
  where session.token = p_session_token
    and session.expires_at > now()
    and driver.is_active = true
  order by driver.display_name;
$$;

create or replace function public.driver_delivery_accepted_orders(p_session_token uuid, p_delivery_date date, p_search text default null)
returns table(delivery_id uuid, order_number text, ship_out_time text, delivery_time text, address text, district_name text, shipping_method text, warning_text text)
language sql stable security definer set search_path = public, private
as $$
  select d.id, o.order_number, coalesce(nullif(btrim(d.ship_out_time), ''), nullif(btrim(o.ship_out_time), '')),
    coalesce(nullif(btrim(d.delivery_time), ''), nullif(btrim(o.delivery_time), '')), o.shipping_address_snapshot, dd.name,
    coalesce(sm.display_name, sm.name), coalesce(nullif(btrim(o.factory_packing_note), ''), nullif(btrim(o.remarks), ''))
  from private.driver_delivery_sessions session
  join public.deliveries d on d.motorcade_id = session.delivery_team_id
  join public.orders o on o.id = d.order_id
  left join public.delivery_districts dd on dd.id = d.district_id
  left join public.shipping_methods sm on sm.id = coalesce(d.shipping_method_id, o.shipping_method_id)
  where session.token=p_session_token and session.expires_at>now()
    and (d.delivery_at at time zone 'Asia/Hong_Kong')::date=p_delivery_date
    and d.taken_at is not null and d.fulfilled_at is null
    and (nullif(btrim(p_search),'') is null or coalesce(o.order_number,'') ilike '%'||btrim(p_search)||'%' or coalesce(o.shipping_address_snapshot,'') ilike '%'||btrim(p_search)||'%')
  order by d.delivery_at,o.order_number;
$$;

create or replace function public.driver_delivery_add_driver(p_session_token uuid, p_display_name text)
returns uuid language plpgsql security definer set search_path = public, private
as $$
declare v_team_id uuid; v_driver_id uuid := gen_random_uuid();
begin
  select session.delivery_team_id into v_team_id from private.driver_delivery_sessions session
  where session.token=p_session_token and session.expires_at>now();
  if v_team_id is null then raise exception 'invalid driver session'; end if;
  if nullif(btrim(p_display_name),'') is null then raise exception 'driver name is required'; end if;
  if exists(select 1 from public.delivery_team_drivers where delivery_team_id=v_team_id and lower(btrim(display_name))=lower(btrim(p_display_name)) and is_active=true) then raise exception 'driver already exists'; end if;
  insert into public.delivery_team_drivers(id,legacy_id,delivery_team_id,display_name,is_active)
  values(v_driver_id,'driver-portal:'||v_driver_id,v_team_id,btrim(p_display_name),true);
  return v_driver_id;
end; $$;

create or replace function public.driver_delivery_delete_driver(p_session_token uuid, p_driver_id uuid)
returns void language plpgsql security definer set search_path = public, private
as $$
declare v_team_id uuid;
begin
  select session.delivery_team_id into v_team_id from private.driver_delivery_sessions session
  where session.token=p_session_token and session.expires_at>now();
  if v_team_id is null then raise exception 'invalid driver session'; end if;
  update public.delivery_team_drivers set is_active=false
  where id=p_driver_id and delivery_team_id=v_team_id and is_active=true;
  if not found then raise exception 'driver not found'; end if;
end; $$;

create or replace function public.driver_delivery_district_fees(p_session_token uuid, p_search text default null)
returns table(id uuid, name text, fee numeric)
language sql stable security definer set search_path = public, private
as $$
  select district.id, district.name, coalesce(district.default_fee,0)
  from private.driver_delivery_sessions session
  join public.delivery_districts district on district.driver_team_id=session.delivery_team_id
  where session.token=p_session_token and session.expires_at>now() and district.archived_at is null
    and (nullif(btrim(p_search),'') is null or district.name ilike '%'||btrim(p_search)||'%')
  order by district.name;
$$;

create or replace function public.driver_delivery_fleet_summary(
  p_session_token uuid,
  p_driver_id uuid default null
)
returns table(month_start date, order_count bigint, completed_count bigint, total_fee numeric)
language sql stable security definer
set search_path = public, private
as $$
  select
    date_trunc('month', d.delivery_at at time zone 'Asia/Hong_Kong')::date,
    count(*),
    count(*) filter (where d.fulfilled_at is not null),
    coalesce(sum(d.total_fee), 0)
  from private.driver_delivery_sessions session
  join public.deliveries d on d.motorcade_id = session.delivery_team_id
  where session.token = p_session_token
    and session.expires_at > now()
    and d.subdriver_legacy_id is not null
    and (p_driver_id is null or d.subdriver_legacy_id = (select legacy_id from public.delivery_team_drivers where id=p_driver_id))
  group by 1
  order by 1 desc;
$$;

create or replace function public.driver_delivery_fleet_days(
  p_session_token uuid,
  p_month_start date,
  p_driver_id uuid default null
)
returns table(delivery_date date, order_count bigint, total_fee numeric)
language sql stable security definer
set search_path = public, private
as $$
  select
    (d.delivery_at at time zone 'Asia/Hong_Kong')::date,
    count(*),
    coalesce(sum(d.total_fee), 0)
  from private.driver_delivery_sessions session
  join public.deliveries d on d.motorcade_id = session.delivery_team_id
  where session.token = p_session_token
    and session.expires_at > now()
    and d.subdriver_legacy_id is not null
    and (p_driver_id is null or d.subdriver_legacy_id = (select legacy_id from public.delivery_team_drivers where id=p_driver_id))
    and (d.delivery_at at time zone 'Asia/Hong_Kong')::date >= p_month_start
    and (d.delivery_at at time zone 'Asia/Hong_Kong')::date < (p_month_start + interval '1 month')::date
  group by 1
  order by 1;
$$;

drop function if exists public.driver_delivery_day_orders(uuid,date,uuid);
create function public.driver_delivery_day_orders(
  p_session_token uuid, p_delivery_date date, p_driver_id uuid default null
)
returns table(
  delivery_id uuid, order_number text, ship_out_time text, delivery_time text,
  address text, customer_name text, customer_phone text, basic_fee numeric,
  total_fee numeric, delivery_status text, taken_at timestamptz, fulfilled_at timestamptz,
  driver_id uuid, driver_name text, surcharges jsonb, images text[]
)
language sql stable security definer set search_path = public, private
as $$
  select d.id, o.order_number, coalesce(d.ship_out_time, o.ship_out_time),
    coalesce(d.delivery_time, o.delivery_time), o.shipping_address_snapshot,
    o.customer_name_snapshot, coalesce(o.contact_number_a_snapshot, o.contact_number_b_snapshot),
    coalesce(d.basic_fee, 0), coalesce(d.total_fee, 0), coalesce(d.delivery_status, o.delivery_status),
    d.taken_at, d.fulfilled_at, driver.id, driver.display_name,
    coalesce((select jsonb_agg(jsonb_build_object('id', surcharge.id, 'name', type.name, 'amount', coalesce(surcharge.amount, 0)) order by surcharge.created_at)
      from public.delivery_surcharges surcharge join public.delivery_surcharge_types type on type.id = surcharge.surcharge_type_id
      where surcharge.delivery_id = d.id), '[]'::jsonb),
    coalesce(d.image_references, '{}')
  from private.driver_delivery_sessions session
  join public.deliveries d on d.motorcade_id = session.delivery_team_id
  join public.orders o on o.id = d.order_id
  left join public.delivery_team_drivers driver on driver.delivery_team_id=session.delivery_team_id and driver.legacy_id=d.subdriver_legacy_id
  where session.token = p_session_token and session.expires_at > now()
    and (d.delivery_at at time zone 'Asia/Hong_Kong')::date = p_delivery_date
    and d.subdriver_legacy_id is not null
    and (p_driver_id is null or d.subdriver_legacy_id = (select legacy_id from public.delivery_team_drivers where id=p_driver_id))
  order by d.delivery_at, o.order_number;
$$;

create or replace function public.driver_delivery_income_summary(p_session_token uuid)
returns table(month_start date, order_count bigint, completed_count bigint, total_fee numeric)
language sql stable security definer set search_path=public,private as $$
select date_trunc('month',d.delivery_at at time zone 'Asia/Hong_Kong')::date,count(*),count(*) filter(where d.fulfilled_at is not null),coalesce(sum(d.total_fee),0)
from private.driver_delivery_sessions session join public.deliveries d on d.motorcade_id=session.delivery_team_id
where session.token=p_session_token and session.expires_at>now() group by 1 order by 1 desc; $$;

create or replace function public.driver_delivery_income_days(p_session_token uuid,p_month_start date)
returns table(delivery_date date,order_count bigint,total_fee numeric)
language sql stable security definer set search_path=public,private as $$
select (d.delivery_at at time zone 'Asia/Hong_Kong')::date,count(*),coalesce(sum(d.total_fee),0)
from private.driver_delivery_sessions session join public.deliveries d on d.motorcade_id=session.delivery_team_id
where session.token=p_session_token and session.expires_at>now() and (d.delivery_at at time zone 'Asia/Hong_Kong')::date>=p_month_start and (d.delivery_at at time zone 'Asia/Hong_Kong')::date<(p_month_start+interval '1 month')::date group by 1 order by 1; $$;

drop function if exists public.driver_delivery_income_day_orders(uuid,date);
create function public.driver_delivery_income_day_orders(p_session_token uuid,p_delivery_date date)
returns table(delivery_id uuid,order_number text,ship_out_time text,delivery_time text,address text,customer_name text,customer_phone text,basic_fee numeric,total_fee numeric,delivery_status text,taken_at timestamptz,fulfilled_at timestamptz,driver_id uuid,driver_name text,surcharges jsonb,images text[])
language sql stable security definer set search_path=public,private as $$
select d.id,o.order_number,coalesce(d.ship_out_time,o.ship_out_time),coalesce(d.delivery_time,o.delivery_time),o.shipping_address_snapshot,o.customer_name_snapshot,coalesce(o.contact_number_a_snapshot,o.contact_number_b_snapshot),coalesce(d.basic_fee,0),coalesce(d.total_fee,0),coalesce(d.delivery_status,o.delivery_status),d.taken_at,d.fulfilled_at,driver.id,driver.display_name,
coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',st.name,'amount',coalesce(s.amount,0)) order by s.created_at) from public.delivery_surcharges s join public.delivery_surcharge_types st on st.id=s.surcharge_type_id where s.delivery_id=d.id),'[]'::jsonb),coalesce(d.image_references,'{}')
from private.driver_delivery_sessions session join public.deliveries d on d.motorcade_id=session.delivery_team_id join public.orders o on o.id=d.order_id left join public.delivery_team_drivers driver on driver.delivery_team_id=session.delivery_team_id and driver.legacy_id=d.subdriver_legacy_id
where session.token=p_session_token and session.expires_at>now() and (d.delivery_at at time zone 'Asia/Hong_Kong')::date=p_delivery_date order by d.delivery_at,o.order_number; $$;

create or replace function public.driver_delivery_export_orders(p_session_token uuid,p_month_start date,p_include_unassigned boolean default false)
returns table(order_number text,delivery_date date,delivery_time text,customer_name text,customer_phone text,district_name text,address text,shipping_method text,driver_name text)
language sql stable security definer set search_path=public,private as $$
select o.order_number,(d.delivery_at at time zone 'Asia/Hong_Kong')::date,coalesce(nullif(btrim(d.delivery_time),''),nullif(btrim(o.delivery_time),'')),o.customer_name_snapshot,
case when nullif(btrim(o.contact_number_a_snapshot),'') is not null and nullif(btrim(o.contact_number_b_snapshot),'') is not null and btrim(o.contact_number_a_snapshot)<>btrim(o.contact_number_b_snapshot) then btrim(o.contact_number_a_snapshot)||' / '||btrim(o.contact_number_b_snapshot) else coalesce(nullif(btrim(o.contact_number_a_snapshot),''),nullif(btrim(o.contact_number_b_snapshot),'')) end,
district.name,o.shipping_address_snapshot,coalesce(method.display_name,method.name),driver.display_name
from private.driver_delivery_sessions session join public.deliveries d on d.motorcade_id=session.delivery_team_id join public.orders o on o.id=d.order_id
left join public.delivery_districts district on district.id=d.district_id left join public.shipping_methods method on method.id=coalesce(d.shipping_method_id,o.shipping_method_id)
left join public.delivery_team_drivers driver on driver.legacy_id=d.subdriver_legacy_id and driver.delivery_team_id=session.delivery_team_id
where session.token=p_session_token and session.expires_at>now() and (p_include_unassigned or d.subdriver_legacy_id is not null)
and (d.delivery_at at time zone 'Asia/Hong_Kong')::date>=p_month_start and (d.delivery_at at time zone 'Asia/Hong_Kong')::date<(p_month_start+interval '1 month')::date
order by d.delivery_at,o.order_number; $$;

create or replace function public.driver_delivery_surcharge_types(p_session_token uuid)
returns table(id uuid, name text)
language sql stable security definer set search_path = public, private
as $$
  select type.id, type.name from public.delivery_surcharge_types type
  where type.is_active = true and exists (
    select 1 from private.driver_delivery_sessions session
    where session.token = p_session_token and session.expires_at > now()
  ) order by type.name;
$$;

create or replace function public.driver_delivery_add_surcharge(
  p_session_token uuid, p_delivery_id uuid, p_surcharge_type_id uuid, p_amount numeric
)
returns void language plpgsql security definer set search_path = public, private
as $$
declare v_team_id uuid; v_surcharge_id uuid := gen_random_uuid();
begin
  select session.delivery_team_id into v_team_id from private.driver_delivery_sessions session
  where session.token = p_session_token and session.expires_at > now();
  if v_team_id is null or not exists (select 1 from public.deliveries where id = p_delivery_id and motorcade_id = v_team_id) then raise exception 'invalid driver session or delivery'; end if;
  if p_amount <= 0 then raise exception 'amount must be greater than zero'; end if;
  insert into public.delivery_surcharges(id, legacy_id, delivery_id, surcharge_type_id, amount)
  values(v_surcharge_id, 'driver-portal:' || v_surcharge_id, p_delivery_id, p_surcharge_type_id, p_amount);
  update public.deliveries set total_fee = coalesce(total_fee, basic_fee, 0) + p_amount, updated_at = now() where id = p_delivery_id;
end; $$;

create or replace function public.driver_delivery_delete_surcharge(p_session_token uuid, p_surcharge_id uuid)
returns void language plpgsql security definer set search_path = public, private
as $$
declare v_delivery_id uuid; v_amount numeric;
begin
  select surcharge.delivery_id, surcharge.amount into v_delivery_id, v_amount
  from public.delivery_surcharges surcharge join public.deliveries delivery on delivery.id = surcharge.delivery_id
  join private.driver_delivery_sessions session on session.delivery_team_id = delivery.motorcade_id
  where surcharge.id = p_surcharge_id and session.token = p_session_token and session.expires_at > now();
  if v_delivery_id is null then raise exception 'surcharge not found'; end if;
  delete from public.delivery_surcharges where id = p_surcharge_id;
  update public.deliveries set total_fee = greatest(coalesce(total_fee, 0) - coalesce(v_amount, 0), coalesce(basic_fee, 0)), updated_at = now() where id = v_delivery_id;
end; $$;

create or replace function public.driver_delivery_attach_image(
  p_session_token uuid, p_delivery_id uuid, p_image_url text
)
returns void language plpgsql security definer set search_path = public, private
as $$
declare v_team_id uuid;
begin
  select session.delivery_team_id into v_team_id from private.driver_delivery_sessions session
  where session.token = p_session_token and session.expires_at > now();
  if v_team_id is null or not exists (select 1 from public.deliveries where id = p_delivery_id and motorcade_id = v_team_id) then raise exception 'invalid driver session or delivery'; end if;
  update public.deliveries set image_references = array_append(coalesce(image_references, '{}'), p_image_url), updated_at = now() where id = p_delivery_id;
end; $$;

create or replace function public.driver_delivery_delete_image(
  p_session_token uuid, p_delivery_id uuid, p_image_url text
)
returns void language plpgsql security definer set search_path = public, private
as $$
declare v_team_id uuid;
begin
  select session.delivery_team_id into v_team_id from private.driver_delivery_sessions session
  where session.token=p_session_token and session.expires_at>now();
  if v_team_id is null or not exists(select 1 from public.deliveries where id=p_delivery_id and motorcade_id=v_team_id) then raise exception 'invalid driver session or delivery'; end if;
  update public.deliveries set image_references=array_remove(coalesce(image_references,'{}'),p_image_url),updated_at=now()
  where id=p_delivery_id and p_image_url=any(coalesce(image_references,'{}'));
  if not found then raise exception 'image not found'; end if;
end; $$;

create or replace function public.driver_delivery_logout(p_session_token uuid)
returns void
language sql
security definer
set search_path = private
as $$
  delete from private.driver_delivery_sessions where token = p_session_token;
$$;

revoke all on function public.driver_delivery_login(text) from public;
revoke all on function public.driver_delivery_available_orders(uuid, date, text) from public;
revoke all on function public.driver_delivery_logout(uuid) from public;
revoke all on function public.driver_delivery_team_drivers(uuid) from public;
revoke all on function public.driver_delivery_reject_order(uuid,uuid) from public;
revoke all on function public.driver_delivery_accept_order(uuid,uuid) from public;
revoke all on function public.driver_delivery_accepted_order_details(uuid,date,text) from public;
revoke all on function public.driver_delivery_pickup_order(uuid,uuid) from public;
revoke all on function public.driver_delivery_deliver_order(uuid,uuid) from public;
revoke all on function public.driver_delivery_assign_driver(uuid,uuid,uuid) from public;
revoke all on function public.driver_delivery_accepted_orders(uuid, date, text) from public;
revoke all on function public.driver_delivery_add_driver(uuid, text) from public;
revoke all on function public.driver_delivery_delete_driver(uuid, uuid) from public;
revoke all on function public.driver_delivery_district_fees(uuid, text) from public;
revoke all on function public.driver_delivery_fleet_summary(uuid, uuid) from public;
revoke all on function public.driver_delivery_fleet_days(uuid, date, uuid) from public;
revoke all on function public.driver_delivery_income_summary(uuid) from public;
revoke all on function public.driver_delivery_income_days(uuid,date) from public;
revoke all on function public.driver_delivery_income_day_orders(uuid,date) from public;
revoke all on function public.driver_delivery_export_orders(uuid,date,boolean) from public;
revoke all on function public.driver_delivery_day_orders(uuid, date, uuid) from public;
revoke all on function public.driver_delivery_surcharge_types(uuid) from public;
revoke all on function public.driver_delivery_add_surcharge(uuid, uuid, uuid, numeric) from public;
revoke all on function public.driver_delivery_delete_surcharge(uuid, uuid) from public;
revoke all on function public.driver_delivery_attach_image(uuid, uuid, text) from public;
revoke all on function public.driver_delivery_delete_image(uuid, uuid, text) from public;
grant execute on function public.driver_delivery_login(text) to anon, authenticated;
grant execute on function public.driver_delivery_available_orders(uuid, date, text) to anon, authenticated;
grant execute on function public.driver_delivery_logout(uuid) to anon, authenticated;
grant execute on function public.driver_delivery_team_drivers(uuid) to anon, authenticated;
grant execute on function public.driver_delivery_reject_order(uuid,uuid) to anon,authenticated;
grant execute on function public.driver_delivery_accept_order(uuid,uuid) to anon,authenticated;
grant execute on function public.driver_delivery_accepted_order_details(uuid,date,text) to anon,authenticated;
grant execute on function public.driver_delivery_pickup_order(uuid,uuid) to anon,authenticated;
grant execute on function public.driver_delivery_deliver_order(uuid,uuid) to anon,authenticated;
grant execute on function public.driver_delivery_assign_driver(uuid,uuid,uuid) to anon,authenticated;
grant execute on function public.driver_delivery_accepted_orders(uuid, date, text) to anon, authenticated;
grant execute on function public.driver_delivery_add_driver(uuid, text) to anon, authenticated;
grant execute on function public.driver_delivery_delete_driver(uuid, uuid) to anon, authenticated;
grant execute on function public.driver_delivery_district_fees(uuid, text) to anon, authenticated;
grant execute on function public.driver_delivery_fleet_summary(uuid, uuid) to anon, authenticated;
grant execute on function public.driver_delivery_fleet_days(uuid, date, uuid) to anon, authenticated;
grant execute on function public.driver_delivery_income_summary(uuid) to anon,authenticated;
grant execute on function public.driver_delivery_income_days(uuid,date) to anon,authenticated;
grant execute on function public.driver_delivery_income_day_orders(uuid,date) to anon,authenticated;
grant execute on function public.driver_delivery_export_orders(uuid,date,boolean) to anon,authenticated;
grant execute on function public.driver_delivery_day_orders(uuid, date, uuid) to anon, authenticated;
grant execute on function public.driver_delivery_surcharge_types(uuid) to anon, authenticated;
grant execute on function public.driver_delivery_add_surcharge(uuid, uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.driver_delivery_delete_surcharge(uuid, uuid) to anon, authenticated;
grant execute on function public.driver_delivery_attach_image(uuid, uuid, text) to service_role;
grant execute on function public.driver_delivery_delete_image(uuid, uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driver-delivery', 'driver-delivery', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
