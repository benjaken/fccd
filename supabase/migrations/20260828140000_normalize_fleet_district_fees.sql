-- Normalize delivery districts and fleet pricing. A delivery keeps the real
-- district id selected on the sales document, while the fleet/district price
-- is linked and snapshotted when a fleet is assigned.

drop trigger if exists ensure_delivery_fleet_district_fee
  on public.deliveries;

create table public.delivery_fleet_district_fees (
  id uuid primary key default gen_random_uuid(),
  delivery_team_id uuid not null references public.delivery_teams (id),
  district_id uuid not null references public.delivery_districts (id),
  fee numeric(14, 2) not null default 0 check (fee >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_team_id, district_id)
);

create index delivery_fleet_district_fees_district_idx
  on public.delivery_fleet_district_fees (district_id);

alter table public.delivery_fleet_district_fees enable row level security;
grant select on public.delivery_fleet_district_fees to authenticated;
grant all on public.delivery_fleet_district_fees to service_role;

create policy "Fleet fee readers read fleet district fees"
on public.delivery_fleet_district_fees
for select
to authenticated
using (private.has_page_access('delivery.fleets'));

-- Older Bubble data represented every fleet price as another district row.
-- Ensure each such name also has one fleet-independent master district.
insert into public.delivery_districts (
  legacy_id,
  name,
  bubble_created_at,
  bubble_modified_at
)
select
  'web-canonical-district-' || gen_random_uuid()::text,
  source.name,
  now(),
  now()
from (
  select distinct on (lower(btrim(legacy.name))) legacy.name
  from public.delivery_districts as legacy
  where legacy.driver_team_id is not null
    and legacy.archived_at is null
    and nullif(btrim(legacy.name), '') is not null
  order by lower(btrim(legacy.name)), legacy.created_at, legacy.id
) as source
where not exists (
  select 1
  from public.delivery_districts as master
  where master.driver_team_id is null
    and master.archived_at is null
    and lower(btrim(master.name)) = lower(btrim(source.name))
);

-- Migrate the legacy fleet-specific district rows into the normalized table.
insert into public.delivery_fleet_district_fees (
  delivery_team_id,
  district_id,
  fee,
  created_at,
  updated_at
)
select distinct on (legacy.driver_team_id, master.id)
  legacy.driver_team_id,
  master.id,
  coalesce(legacy.default_fee, 0),
  coalesce(legacy.created_at, now()),
  now()
from public.delivery_districts as legacy
join lateral (
  select candidate.id
  from public.delivery_districts as candidate
  where candidate.driver_team_id is null
    and candidate.archived_at is null
    and lower(btrim(candidate.name)) = lower(btrim(legacy.name))
  order by candidate.created_at, candidate.id
  limit 1
) as master on true
where legacy.driver_team_id is not null
  and legacy.archived_at is null
order by legacy.driver_team_id, master.id, legacy.created_at desc, legacy.id desc
on conflict (delivery_team_id, district_id) do update
set fee = excluded.fee,
    updated_at = now();

-- Restore sales documents and deliveries to the canonical district id.
update public.orders as sales_document
set delivery_district_id = master.id,
    updated_at = now()
from public.delivery_districts as legacy
join lateral (
  select candidate.id
  from public.delivery_districts as candidate
  where candidate.driver_team_id is null
    and candidate.archived_at is null
    and lower(btrim(candidate.name)) = lower(btrim(legacy.name))
  order by candidate.created_at, candidate.id
  limit 1
) as master on true
where sales_document.delivery_district_id = legacy.id
  and legacy.driver_team_id is not null;

update public.deliveries as delivery
set district_id = master.id,
    updated_at = now()
from public.delivery_districts as legacy
join lateral (
  select candidate.id
  from public.delivery_districts as candidate
  where candidate.driver_team_id is null
    and candidate.archived_at is null
    and lower(btrim(candidate.name)) = lower(btrim(legacy.name))
  order by candidate.created_at, candidate.id
  limit 1
) as master on true
where delivery.district_id = legacy.id
  and legacy.driver_team_id is not null;

update public.delivery_districts
set archived_at = coalesce(archived_at, now()),
    updated_at = now()
where driver_team_id is not null
  and archived_at is null;

alter table public.deliveries
  add column fleet_district_fee_id uuid
    references public.delivery_fleet_district_fees (id);

create index deliveries_fleet_district_fee_id_idx
  on public.deliveries (fleet_district_fee_id);

comment on column public.deliveries.fleet_district_fee_id is
  'Fleet/district price selected when the delivery fleet was assigned. basic_fee is the immutable assignment-time amount snapshot.';

-- Every active master district is visible for every active fleet. Missing
-- prices are shown as zero and are materialized when saved or assigned.
drop function if exists public.delivery_fleet_fee_list(uuid);

create function public.delivery_fleet_fee_list(p_fleet_id uuid)
returns table (
  fee_id uuid,
  district_id uuid,
  fleet_id uuid,
  fleet_name text,
  district_name text,
  fee numeric
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('delivery.fleets') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return query
  select price.id, district.id, team.id, team.name, district.name,
    coalesce(price.fee, 0)::numeric
  from public.delivery_teams as team
  cross join public.delivery_districts as district
  left join public.delivery_fleet_district_fees as price
    on price.delivery_team_id = team.id
   and price.district_id = district.id
  where (p_fleet_id is null or team.id = p_fleet_id)
    and team.archived_at is null
    and team.is_active = true
    and district.driver_team_id is null
    and district.archived_at is null
  order by team.name, district.name;
end;
$$;

drop function if exists public.save_delivery_fleet_fee(uuid, numeric);

create function public.save_delivery_fleet_fee(
  p_fleet_id uuid,
  p_district_id uuid,
  p_fee numeric
)
returns table (
  fee_id uuid,
  district_id uuid,
  fleet_id uuid,
  fleet_name text,
  district_name text,
  fee numeric
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_fee_id uuid;
begin
  if not private.has_page_manage('delivery.fleets') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if p_fee is null or p_fee < 0 then
    raise exception 'fee_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.delivery_teams
    where id = p_fleet_id and archived_at is null
  ) or not exists (
    select 1 from public.delivery_districts
    where id = p_district_id and driver_team_id is null and archived_at is null
  ) then
    raise exception 'fleet_district_not_found' using errcode = 'P0002';
  end if;

  insert into public.delivery_fleet_district_fees as price (
    delivery_team_id, district_id, fee
  ) values (
    p_fleet_id, p_district_id, p_fee
  )
  on conflict (delivery_team_id, district_id) do update
  set fee = excluded.fee,
      updated_at = now()
  returning price.id into v_fee_id;

  return query
  select price.id, district.id, team.id, team.name, district.name, price.fee
  from public.delivery_fleet_district_fees as price
  join public.delivery_teams as team on team.id = price.delivery_team_id
  join public.delivery_districts as district on district.id = price.district_id
  where price.id = v_fee_id;
end;
$$;

revoke all on function public.delivery_fleet_fee_list(uuid) from public, anon;
revoke all on function public.save_delivery_fleet_fee(uuid, uuid, numeric) from public, anon;
grant execute on function public.delivery_fleet_fee_list(uuid) to authenticated;
grant execute on function public.save_delivery_fleet_fee(uuid, uuid, numeric) to authenticated;

-- The editor uses one concurrency-safe entry point so a newly typed district
-- becomes shared master data for both quotes and orders.
create or replace function public.create_delivery_district_option(p_name text)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'district_name_required' using errcode = '22023';
  end if;
  if not (
    private.has_page_manage('settings.districts')
    or private.has_page_manage('orders')
    or private.has_page_manage('quotes')
    or private.has_page_access('orders.new')
  ) then
    raise exception 'district_create_not_allowed' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('delivery-district:' || lower(v_name)));

  select district.id
  into v_id
  from public.delivery_districts as district
  where district.driver_team_id is null
    and district.archived_at is null
    and lower(btrim(district.name)) = lower(v_name)
  order by district.created_at, district.id
  limit 1;

  if v_id is null then
    insert into public.delivery_districts as inserted (
      legacy_id, name, bubble_created_at, bubble_modified_at
    ) values (
      'web-delivery-district-' || gen_random_uuid()::text,
      v_name,
      now(),
      now()
    ) returning inserted.id into v_id;
  end if;

  return query
  select district.id, district.name
  from public.delivery_districts as district
  where district.id = v_id;
end;
$$;

revoke all on function public.create_delivery_district_option(text)
  from public, anon;
grant execute on function public.create_delivery_district_option(text)
  to authenticated;

-- Replace the legacy trigger that rewrote deliveries.district_id. This one
-- keeps the district intact and binds the selected fleet price instead.
create or replace function private.ensure_delivery_fleet_district_fee()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_fee_id uuid;
  v_fee numeric;
  v_surcharges numeric;
begin
  if new.motorcade_id is null or new.district_id is null then
    new.fleet_district_fee_id := null;
    new.basic_fee := null;
    new.total_fee := null;
    return new;
  end if;

  insert into public.delivery_fleet_district_fees as price (
    delivery_team_id, district_id, fee
  ) values (
    new.motorcade_id, new.district_id, 0
  )
  on conflict (delivery_team_id, district_id) do nothing;

  select price.id, price.fee
  into v_fee_id, v_fee
  from public.delivery_fleet_district_fees as price
  where price.delivery_team_id = new.motorcade_id
    and price.district_id = new.district_id;

  select coalesce(sum(surcharge.amount), 0)
  into v_surcharges
  from public.delivery_surcharges as surcharge
  where surcharge.delivery_id = new.id;

  new.fleet_district_fee_id := v_fee_id;
  new.basic_fee := coalesce(v_fee, 0);
  new.total_fee := coalesce(v_fee, 0) + coalesce(v_surcharges, 0);
  return new;
end;
$$;

drop trigger if exists ensure_delivery_fleet_district_fee
  on public.deliveries;

create trigger ensure_delivery_fleet_district_fee
before insert or update of motorcade_id, district_id
on public.deliveries
for each row
execute function private.ensure_delivery_fleet_district_fee();

-- Link existing assignments without changing their historical amount. Where
-- the old basic fee is absent, use the configured price as the snapshot.
insert into public.delivery_fleet_district_fees as price (
  delivery_team_id, district_id, fee
)
select distinct delivery.motorcade_id, delivery.district_id,
  coalesce(delivery.basic_fee, 0)
from public.deliveries as delivery
where delivery.motorcade_id is not null
  and delivery.district_id is not null
on conflict (delivery_team_id, district_id) do nothing;

update public.deliveries as delivery
set fleet_district_fee_id = price.id,
    basic_fee = coalesce(delivery.basic_fee, price.fee),
    total_fee = coalesce(delivery.total_fee, delivery.basic_fee, price.fee)
from public.delivery_fleet_district_fees as price
where price.delivery_team_id = delivery.motorcade_id
  and price.district_id = delivery.district_id
  and delivery.fleet_district_fee_id is null;
