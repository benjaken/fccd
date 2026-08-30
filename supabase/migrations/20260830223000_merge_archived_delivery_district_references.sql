-- Merge references from archived, fleet-specific Bubble districts into the
-- active canonical district dictionary. Preserve delivery amounts exactly:
-- changing district_id invokes automatic fee assignment, while historical
-- Bubble amounts (including a deliberate null basic fee) remain authoritative.

create or replace function private.canonical_delivery_district_id(
  p_district_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_name text;
  v_archived_at timestamptz;
  v_canonical_id uuid;
begin
  if p_district_id is null then
    return null;
  end if;

  select district.name, district.archived_at
  into v_name, v_archived_at
  from public.delivery_districts as district
  where district.id = p_district_id;

  if not found or v_archived_at is null or nullif(btrim(v_name), '') is null then
    return p_district_id;
  end if;

  select district.id
  into v_canonical_id
  from public.delivery_districts as district
  where district.archived_at is null
    and district.driver_team_id is null
    and lower(btrim(district.name)) = lower(btrim(v_name))
  order by district.created_at, district.id
  limit 1;

  return coalesce(v_canonical_id, p_district_id);
end;
$$;

revoke all on function private.canonical_delivery_district_id(uuid)
  from public, anon, authenticated;

create or replace function private.canonicalize_delivery_district_reference()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  new.district_id := private.canonical_delivery_district_id(new.district_id);
  return new;
end;
$$;

create or replace function private.canonicalize_order_delivery_district_reference()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  new.delivery_district_id :=
    private.canonical_delivery_district_id(new.delivery_district_id);
  return new;
end;
$$;

revoke all on function private.canonicalize_delivery_district_reference()
  from public, anon, authenticated;
revoke all on function private.canonicalize_order_delivery_district_reference()
  from public, anon, authenticated;

drop trigger if exists canonicalize_delivery_district_reference
  on public.deliveries;
create trigger canonicalize_delivery_district_reference
before insert or update of district_id
on public.deliveries
for each row
execute function private.canonicalize_delivery_district_reference();

drop trigger if exists canonicalize_order_delivery_district_reference
  on public.orders;
create trigger canonicalize_order_delivery_district_reference
before insert or update of delivery_district_id
on public.orders
for each row
execute function private.canonicalize_order_delivery_district_reference();

create temporary table district_merge_map
on commit drop
as
select
  archived.id as archived_id,
  canonical.id as canonical_id
from public.delivery_districts as archived
cross join lateral (
  select active.id
  from public.delivery_districts as active
  where active.archived_at is null
    and active.driver_team_id is null
    and lower(btrim(active.name)) = lower(btrim(archived.name))
  order by active.created_at, active.id
  limit 1
) as canonical
where archived.archived_at is not null;

create unique index district_merge_map_archived_id_key
  on district_merge_map (archived_id);

create temporary table delivery_fee_snapshot
on commit drop
as
select
  delivery.id,
  delivery.basic_fee,
  delivery.total_fee
from public.deliveries as delivery
join district_merge_map as mapping
  on mapping.archived_id = delivery.district_id;

create unique index delivery_fee_snapshot_id_key
  on delivery_fee_snapshot (id);

create temporary table protected_delivery_fee_snapshot
on commit drop
as
select
  orders.order_number,
  delivery.id,
  delivery.basic_fee,
  delivery.total_fee
from public.deliveries as delivery
join public.orders as orders on orders.id = delivery.order_id
where orders.order_number in (
  '#6944', 'P-1146', '#6952', 'P-1147', '#6951', '#6954', '#6957',
  '#6958', 'B-1555', 'K-2130', '#6953', '#6955', '#6956', 'B-1548'
);

create unique index protected_delivery_fee_snapshot_id_key
  on protected_delivery_fee_snapshot (id);

update public.deliveries as delivery
set district_id = mapping.canonical_id
from district_merge_map as mapping
where delivery.district_id = mapping.archived_id;

-- Restore the exact source amounts after district reassignment. Updating only
-- fee columns does not re-run the district/team fee assignment trigger.
update public.deliveries as delivery
set basic_fee = snapshot.basic_fee,
    total_fee = snapshot.total_fee
from delivery_fee_snapshot as snapshot
where delivery.id = snapshot.id
  and row(delivery.basic_fee, delivery.total_fee)
    is distinct from row(snapshot.basic_fee, snapshot.total_fee);

update public.orders as orders
set delivery_district_id = mapping.canonical_id
from district_merge_map as mapping
where orders.delivery_district_id = mapping.archived_id;

-- Any deliveries that still point at an archived fee row are moved to the
-- already configured canonical fleet/district fee before duplicate rows go.
update public.deliveries as delivery
set fleet_district_fee_id = canonical_fee.id
from public.delivery_fleet_district_fees as archived_fee
join district_merge_map as mapping
  on mapping.archived_id = archived_fee.district_id
join public.delivery_fleet_district_fees as canonical_fee
  on canonical_fee.delivery_team_id = archived_fee.delivery_team_id
 and canonical_fee.district_id = mapping.canonical_id
where delivery.fleet_district_fee_id = archived_fee.id;

delete from public.delivery_fleet_district_fees as archived_fee
using district_merge_map as mapping,
      public.delivery_fleet_district_fees as canonical_fee
where archived_fee.district_id = mapping.archived_id
  and canonical_fee.delivery_team_id = archived_fee.delivery_team_id
  and canonical_fee.district_id = mapping.canonical_id;

-- Preserve a non-conflicting fee configuration by moving it to the canonical
-- district. This is normally a no-op but makes the migration safe on drifted
-- environments.
update public.delivery_fleet_district_fees as archived_fee
set district_id = mapping.canonical_id,
    updated_at = now()
from district_merge_map as mapping
where archived_fee.district_id = mapping.archived_id
  and not exists (
    select 1
    from public.delivery_fleet_district_fees as canonical_fee
    where canonical_fee.delivery_team_id = archived_fee.delivery_team_id
      and canonical_fee.district_id = mapping.canonical_id
  );

do $$
begin
  if exists (
    select 1
    from public.deliveries as delivery
    join district_merge_map as mapping
      on mapping.archived_id = delivery.district_id
  ) then
    raise exception 'archived_delivery_district_references_remain';
  end if;

  if exists (
    select 1
    from public.orders as orders
    join district_merge_map as mapping
      on mapping.archived_id = orders.delivery_district_id
  ) then
    raise exception 'archived_order_district_references_remain';
  end if;

  if exists (
    select 1
    from public.delivery_fleet_district_fees as fee
    join district_merge_map as mapping
      on mapping.archived_id = fee.district_id
  ) then
    raise exception 'archived_district_fee_references_remain';
  end if;

  if exists (
    select 1
    from public.deliveries as delivery
    join delivery_fee_snapshot as snapshot on snapshot.id = delivery.id
    where row(delivery.basic_fee, delivery.total_fee)
      is distinct from row(snapshot.basic_fee, snapshot.total_fee)
  ) then
    raise exception 'delivery_fees_changed_during_district_merge';
  end if;

  if exists (
    select 1
    from protected_delivery_fee_snapshot as snapshot
    join public.deliveries as delivery on delivery.id = snapshot.id
    where row(delivery.basic_fee, delivery.total_fee)
      is distinct from row(snapshot.basic_fee, snapshot.total_fee)
  ) then
    raise exception 'protected_delivery_fees_changed';
  end if;
end;
$$;
