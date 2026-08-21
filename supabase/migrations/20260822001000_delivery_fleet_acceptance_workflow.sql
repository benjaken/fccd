-- Operations assigns a fleet; the fleet accepts the job and manages its own driver.
-- Accepting a job is intentionally separate from physically picking it up.

alter table public.deliveries
  add column if not exists accepted_at timestamptz;

comment on column public.deliveries.accepted_at is
  'Time the assigned fleet accepted the delivery. This is not the pickup time.';

create index if not exists deliveries_accepted_at_idx
  on public.deliveries (accepted_at);

-- The previous accept RPC wrote taken_at while leaving the status at 待取貨.
-- Those rows can be identified safely and repaired without changing real pickups.
update public.deliveries
set
  accepted_at = coalesce(accepted_at, taken_at),
  taken_at = null,
  driver_confirmation_status = 'accepted',
  updated_at = now()
where taken_at is not null
  and fulfilled_at is null
  and delivery_status = '待取貨';

update public.deliveries
set
  accepted_at = coalesce(accepted_at, taken_at, fulfilled_at),
  driver_confirmation_status = coalesce(driver_confirmation_status, 'accepted'),
  updated_at = now()
where accepted_at is null
  and (taken_at is not null or fulfilled_at is not null);

create or replace function private.normalize_order_delivery_state()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_document_type text;
begin
  if new.order_id is null then
    return new;
  end if;

  select orders.document_type
  into v_document_type
  from public.orders
  where orders.id = new.order_id;

  if v_document_type is distinct from 'order' then
    return new;
  end if;

  if coalesce(new.delivery_status, '') in ('已取消', '取消', 'Cancelled') then
    new.delivery_status := '已取消';
  elsif new.fulfilled_at is not null then
    new.delivery_status := '已送達';
  elsif new.taken_at is not null then
    new.delivery_status := '已取貨';
  elsif new.accepted_at is not null then
    new.delivery_status := '待取貨';
  elsif new.motorcade_id is not null then
    new.delivery_status := '待接單';
  elsif new.delivery_status is null or new.delivery_status in (
    'Pending', 'pending', '未派車隊', '待接單', '待取貨', '已取貨', '已送達'
  ) then
    new.delivery_status := '未派車隊';
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_order_delivery_state on public.deliveries;
create trigger normalize_order_delivery_state
before insert or update of
  order_id, motorcade_id, accepted_at, taken_at, fulfilled_at, delivery_status
on public.deliveries
for each row execute function private.normalize_order_delivery_state();

create or replace function private.refresh_order_delivery_status(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_total_count bigint;
  v_active_count bigint;
  v_unfulfilled_count bigint;
  v_any_taken boolean;
  v_any_accepted boolean;
  v_any_assigned boolean;
  v_status text;
begin
  if p_order_id is null or not exists (
    select 1
    from public.orders
    where id = p_order_id and document_type = 'order'
  ) then
    return;
  end if;

  select
    count(*),
    count(*) filter (
      where coalesce(delivery_status, '') not in ('已取消', '取消', 'Cancelled')
    ),
    count(*) filter (
      where coalesce(delivery_status, '') not in ('已取消', '取消', 'Cancelled')
        and fulfilled_at is null
    ),
    coalesce(bool_or(
      coalesce(delivery_status, '') not in ('已取消', '取消', 'Cancelled')
      and fulfilled_at is null
      and taken_at is not null
    ), false),
    coalesce(bool_or(
      coalesce(delivery_status, '') not in ('已取消', '取消', 'Cancelled')
      and fulfilled_at is null
      and accepted_at is not null
    ), false),
    coalesce(bool_or(
      coalesce(delivery_status, '') not in ('已取消', '取消', 'Cancelled')
      and fulfilled_at is null
      and motorcade_id is not null
    ), false)
  into
    v_total_count,
    v_active_count,
    v_unfulfilled_count,
    v_any_taken,
    v_any_accepted,
    v_any_assigned
  from public.deliveries
  where order_id = p_order_id;

  v_status := case
    when v_total_count = 0 then null
    when v_active_count = 0 then '已取消'
    when v_unfulfilled_count = 0 then '已送達'
    when v_any_taken then '已取貨'
    when v_any_accepted then '待取貨'
    when v_any_assigned then '待接單'
    else '未派車隊'
  end;

  update public.orders
  set delivery_status = v_status, updated_at = now()
  where id = p_order_id
    and delivery_status is distinct from v_status;
end;
$$;

create or replace function private.sync_order_delivery_status_from_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_order_delivery_status(old.order_id);
    return old;
  end if;

  perform private.refresh_order_delivery_status(new.order_id);
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform private.refresh_order_delivery_status(old.order_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_order_delivery_status_from_delivery on public.deliveries;
create trigger sync_order_delivery_status_from_delivery
after insert or delete or update of
  order_id, motorcade_id, accepted_at, taken_at, fulfilled_at, delivery_status
on public.deliveries
for each row execute function private.sync_order_delivery_status_from_delivery();

-- Normalize existing order deliveries before projecting the status to orders.
update public.deliveries delivery
set
  delivery_status = case
    when coalesce(delivery.delivery_status, '') in ('已取消', '取消', 'Cancelled') then '已取消'
    when delivery.fulfilled_at is not null then '已送達'
    when delivery.taken_at is not null then '已取貨'
    when delivery.accepted_at is not null then '待取貨'
    when delivery.motorcade_id is not null then '待接單'
    else '未派車隊'
  end,
  driver_confirmation_status = case
    when delivery.accepted_at is not null then 'accepted'
    when delivery.motorcade_id is not null then coalesce(delivery.driver_confirmation_status, 'pending')
    else delivery.driver_confirmation_status
  end,
  updated_at = now()
from public.orders orders
where orders.id = delivery.order_id
  and orders.document_type = 'order';

do $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select distinct delivery.order_id
    from public.deliveries delivery
    join public.orders orders on orders.id = delivery.order_id
    where orders.document_type = 'order'
  loop
    perform private.refresh_order_delivery_status(v_order_id);
  end loop;
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
  v_current_team_id uuid;
  v_taken_at timestamptz;
  v_fulfilled_at timestamptz;
  v_delivery_status text;
begin
  if coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '')
    not in ('Super Admin', 'Admin', 'Accounting', 'Factory')
  then
    raise exception 'not allowed to assign delivery fleet';
  end if;

  select motorcade_id, taken_at, fulfilled_at, delivery_status
  into v_current_team_id, v_taken_at, v_fulfilled_at, v_delivery_status
  from public.deliveries
  where id = p_delivery_id
  for update;

  if not found then
    raise exception 'delivery not found';
  end if;

  if p_motorcade_id is not null then
    select legacy_id
    into v_team_legacy_id
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
    and (v_taken_at is not null or v_fulfilled_at is not null)
  then
    raise exception 'picked up or delivered orders cannot change fleet';
  end if;

  update public.deliveries delivery
  set
    motorcade_id = p_motorcade_id,
    motorcade_legacy_id = v_team_legacy_id,
    subdriver_id = case
      when v_current_team_id is distinct from p_motorcade_id then null
      else delivery.subdriver_id
    end,
    subdriver_legacy_id = case
      when v_current_team_id is distinct from p_motorcade_id then null
      else delivery.subdriver_legacy_id
    end,
    accepted_at = case
      when v_current_team_id is distinct from p_motorcade_id then null
      else delivery.accepted_at
    end,
    driver_confirmation_status = case
      when v_current_team_id is not distinct from p_motorcade_id then delivery.driver_confirmation_status
      when p_motorcade_id is null then null
      else 'pending'
    end,
    delivery_status = case
      when v_current_team_id is not distinct from p_motorcade_id then delivery.delivery_status
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

create or replace function public.driver_delivery_available_orders(
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
  shipping_method text,
  warning_text text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select
    delivery.id,
    orders.order_number,
    coalesce(nullif(btrim(delivery.ship_out_time), ''), nullif(btrim(orders.ship_out_time), '')),
    coalesce(nullif(btrim(delivery.delivery_time), ''), nullif(btrim(orders.delivery_time), '')),
    orders.shipping_address_snapshot,
    district.name,
    coalesce(method.display_name, method.name),
    coalesce(nullif(btrim(orders.factory_packing_note), ''), nullif(btrim(orders.remarks), ''))
  from private.driver_delivery_sessions session
  join public.deliveries delivery on delivery.motorcade_id = session.delivery_team_id
  join public.orders orders on orders.id = delivery.order_id
  left join public.delivery_districts district on district.id = delivery.district_id
  left join public.shipping_methods method
    on method.id = coalesce(delivery.shipping_method_id, orders.shipping_method_id)
  where session.token = p_session_token
    and session.expires_at > now()
    and (delivery.delivery_at at time zone 'Asia/Hong_Kong')::date = p_delivery_date
    and delivery.accepted_at is null
    and delivery.taken_at is null
    and delivery.fulfilled_at is null
    and not exists (
      select 1
      from private.driver_delivery_rejections rejection
      where rejection.delivery_id = delivery.id
        and rejection.delivery_team_id = session.delivery_team_id
    )
    and coalesce(delivery.delivery_status, orders.delivery_status, '')
      not in ('已取消', '取消', 'Cancelled')
    and (
      nullif(btrim(p_search), '') is null
      or coalesce(orders.order_number, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(orders.shipping_address_snapshot, '') ilike '%' || btrim(p_search) || '%'
    )
  order by delivery.delivery_at, orders.order_number;
$$;

create or replace function public.driver_delivery_accept_order(
  p_session_token uuid,
  p_delivery_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_team_id uuid;
begin
  select session.delivery_team_id
  into v_team_id
  from private.driver_delivery_sessions session
  where session.token = p_session_token
    and session.expires_at > now();

  if v_team_id is null then
    raise exception 'invalid driver session';
  end if;

  update public.deliveries delivery
  set
    accepted_at = coalesce(delivery.accepted_at, now()),
    driver_confirmation_status = 'accepted',
    delivery_status = '待取貨',
    updated_at = now()
  where delivery.id = p_delivery_id
    and delivery.motorcade_id = v_team_id
    and delivery.taken_at is null
    and delivery.fulfilled_at is null
    and coalesce(delivery.delivery_status, '') not in ('已取消', '取消', 'Cancelled')
    and not exists (
      select 1
      from private.driver_delivery_rejections rejection
      where rejection.delivery_id = delivery.id
        and rejection.delivery_team_id = v_team_id
    );

  if not found then
    raise exception 'delivery is not available';
  end if;
end;
$$;

create or replace function public.driver_delivery_reject_order(
  p_session_token uuid,
  p_delivery_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_team_id uuid;
begin
  select session.delivery_team_id
  into v_team_id
  from private.driver_delivery_sessions session
  where session.token = p_session_token
    and session.expires_at > now();

  if v_team_id is null then
    raise exception 'invalid driver session';
  end if;

  if not exists (
    select 1
    from public.deliveries delivery
    where delivery.id = p_delivery_id
      and delivery.motorcade_id = v_team_id
      and delivery.taken_at is null
      and delivery.fulfilled_at is null
  ) then
    raise exception 'delivery is not available';
  end if;

  insert into private.driver_delivery_rejections (delivery_id, delivery_team_id)
  values (p_delivery_id, v_team_id)
  on conflict do nothing;

  update public.deliveries
  set
    motorcade_id = null,
    motorcade_legacy_id = null,
    subdriver_id = null,
    subdriver_legacy_id = null,
    accepted_at = null,
    driver_confirmation_status = 'rejected',
    delivery_status = '未派車隊',
    updated_at = now()
  where id = p_delivery_id
    and motorcade_id = v_team_id;
end;
$$;

create or replace function public.driver_delivery_accepted_order_details(
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
  shipping_method text,
  warning_text text,
  customer_name text,
  customer_phone text,
  basic_fee numeric,
  total_fee numeric,
  taken_at timestamptz,
  fulfilled_at timestamptz,
  driver_id uuid,
  driver_name text,
  surcharges jsonb,
  images text[]
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select
    delivery.id,
    orders.order_number,
    coalesce(delivery.ship_out_time, orders.ship_out_time),
    coalesce(delivery.delivery_time, orders.delivery_time),
    orders.shipping_address_snapshot,
    district.name,
    coalesce(method.display_name, method.name),
    coalesce(nullif(btrim(orders.factory_packing_note), ''), nullif(btrim(orders.remarks), '')),
    orders.customer_name_snapshot,
    case
      when nullif(btrim(orders.contact_number_a_snapshot), '') is not null
        and nullif(btrim(orders.contact_number_b_snapshot), '') is not null
        and btrim(orders.contact_number_a_snapshot) <> btrim(orders.contact_number_b_snapshot)
      then btrim(orders.contact_number_a_snapshot) || ' / ' || btrim(orders.contact_number_b_snapshot)
      else coalesce(
        nullif(btrim(orders.contact_number_a_snapshot), ''),
        nullif(btrim(orders.contact_number_b_snapshot), '')
      )
    end,
    coalesce(delivery.basic_fee, 0),
    coalesce(delivery.total_fee, 0),
    delivery.taken_at,
    delivery.fulfilled_at,
    driver.id,
    driver.display_name,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', surcharge.id,
          'name', surcharge_type.name,
          'amount', coalesce(surcharge.amount, 0)
        )
        order by surcharge.created_at
      )
      from public.delivery_surcharges surcharge
      join public.delivery_surcharge_types surcharge_type
        on surcharge_type.id = surcharge.surcharge_type_id
      where surcharge.delivery_id = delivery.id
    ), '[]'::jsonb),
    coalesce(delivery.image_references, '{}')
  from private.driver_delivery_sessions session
  join public.deliveries delivery on delivery.motorcade_id = session.delivery_team_id
  join public.orders orders on orders.id = delivery.order_id
  left join public.delivery_districts district on district.id = delivery.district_id
  left join public.shipping_methods method
    on method.id = coalesce(delivery.shipping_method_id, orders.shipping_method_id)
  left join public.delivery_team_drivers driver
    on driver.id = delivery.subdriver_id
    and driver.delivery_team_id = session.delivery_team_id
  where session.token = p_session_token
    and session.expires_at > now()
    and (delivery.delivery_at at time zone 'Asia/Hong_Kong')::date = p_delivery_date
    and delivery.accepted_at is not null
    and (
      nullif(btrim(p_search), '') is null
      or coalesce(orders.order_number, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(orders.shipping_address_snapshot, '') ilike '%' || btrim(p_search) || '%'
    )
  order by delivery.delivery_at, orders.order_number;
$$;

create or replace function public.driver_delivery_accepted_orders(
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
  shipping_method text,
  warning_text text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select
    delivery.id,
    orders.order_number,
    coalesce(nullif(btrim(delivery.ship_out_time), ''), nullif(btrim(orders.ship_out_time), '')),
    coalesce(nullif(btrim(delivery.delivery_time), ''), nullif(btrim(orders.delivery_time), '')),
    orders.shipping_address_snapshot,
    district.name,
    coalesce(method.display_name, method.name),
    coalesce(nullif(btrim(orders.factory_packing_note), ''), nullif(btrim(orders.remarks), ''))
  from private.driver_delivery_sessions session
  join public.deliveries delivery on delivery.motorcade_id = session.delivery_team_id
  join public.orders orders on orders.id = delivery.order_id
  left join public.delivery_districts district on district.id = delivery.district_id
  left join public.shipping_methods method
    on method.id = coalesce(delivery.shipping_method_id, orders.shipping_method_id)
  where session.token = p_session_token
    and session.expires_at > now()
    and (delivery.delivery_at at time zone 'Asia/Hong_Kong')::date = p_delivery_date
    and delivery.accepted_at is not null
    and delivery.fulfilled_at is null
    and (
      nullif(btrim(p_search), '') is null
      or coalesce(orders.order_number, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(orders.shipping_address_snapshot, '') ilike '%' || btrim(p_search) || '%'
    )
  order by delivery.delivery_at, orders.order_number;
$$;

create or replace function public.driver_delivery_pickup_order(
  p_session_token uuid,
  p_delivery_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_team_id uuid;
begin
  select delivery_team_id
  into v_team_id
  from private.driver_delivery_sessions
  where token = p_session_token and expires_at > now();

  if v_team_id is null then
    raise exception 'invalid driver session';
  end if;

  update public.deliveries
  set taken_at = now(), delivery_status = '已取貨', updated_at = now()
  where id = p_delivery_id
    and motorcade_id = v_team_id
    and accepted_at is not null
    and taken_at is null
    and fulfilled_at is null;

  if not found then
    raise exception 'order cannot be picked up';
  end if;
end;
$$;

create or replace function public.driver_delivery_deliver_order(
  p_session_token uuid,
  p_delivery_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_team_id uuid;
begin
  select delivery_team_id
  into v_team_id
  from private.driver_delivery_sessions
  where token = p_session_token and expires_at > now();

  if v_team_id is null then
    raise exception 'invalid driver session';
  end if;

  update public.deliveries
  set fulfilled_at = now(), delivery_status = '已送達', updated_at = now()
  where id = p_delivery_id
    and motorcade_id = v_team_id
    and accepted_at is not null
    and taken_at is not null
    and fulfilled_at is null;

  if not found then
    raise exception 'order must be picked up before delivery';
  end if;
end;
$$;

create or replace function public.driver_delivery_assign_driver(
  p_session_token uuid,
  p_delivery_id uuid,
  p_driver_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_team_id uuid;
  v_driver_legacy_id text;
begin
  select delivery_team_id
  into v_team_id
  from private.driver_delivery_sessions
  where token = p_session_token and expires_at > now();

  select legacy_id
  into v_driver_legacy_id
  from public.delivery_team_drivers
  where id = p_driver_id
    and delivery_team_id = v_team_id
    and is_active = true;

  if v_team_id is null or v_driver_legacy_id is null then
    raise exception 'invalid driver assignment';
  end if;

  update public.deliveries
  set
    subdriver_id = p_driver_id,
    subdriver_legacy_id = v_driver_legacy_id,
    updated_at = now()
  where id = p_delivery_id
    and motorcade_id = v_team_id
    and accepted_at is not null
    and fulfilled_at is null;

  if not found then
    raise exception 'delivery not found, not accepted, or already completed';
  end if;
end;
$$;

revoke all on function public.assign_delivery_motorcade(uuid, uuid) from public;
grant execute on function public.assign_delivery_motorcade(uuid, uuid) to authenticated;

revoke all on function public.driver_delivery_available_orders(uuid, date, text) from public;
revoke all on function public.driver_delivery_accept_order(uuid, uuid) from public;
revoke all on function public.driver_delivery_reject_order(uuid, uuid) from public;
revoke all on function public.driver_delivery_accepted_order_details(uuid, date, text) from public;
revoke all on function public.driver_delivery_accepted_orders(uuid, date, text) from public;
revoke all on function public.driver_delivery_pickup_order(uuid, uuid) from public;
revoke all on function public.driver_delivery_deliver_order(uuid, uuid) from public;
revoke all on function public.driver_delivery_assign_driver(uuid, uuid, uuid) from public;

revoke all on function private.normalize_order_delivery_state() from public, anon, authenticated;
revoke all on function private.refresh_order_delivery_status(uuid) from public, anon, authenticated;
revoke all on function private.sync_order_delivery_status_from_delivery() from public, anon, authenticated;

grant execute on function public.driver_delivery_available_orders(uuid, date, text) to anon, authenticated;
grant execute on function public.driver_delivery_accept_order(uuid, uuid) to anon, authenticated;
grant execute on function public.driver_delivery_reject_order(uuid, uuid) to anon, authenticated;
grant execute on function public.driver_delivery_accepted_order_details(uuid, date, text) to anon, authenticated;
grant execute on function public.driver_delivery_accepted_orders(uuid, date, text) to anon, authenticated;
grant execute on function public.driver_delivery_pickup_order(uuid, uuid) to anon, authenticated;
grant execute on function public.driver_delivery_deliver_order(uuid, uuid) to anon, authenticated;
grant execute on function public.driver_delivery_assign_driver(uuid, uuid, uuid) to anon, authenticated;
