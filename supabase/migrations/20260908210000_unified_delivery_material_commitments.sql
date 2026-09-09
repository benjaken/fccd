-- New-order inventory commitments are delivery-scoped.  A line may be split
-- across delivery legs, but every material-bearing line must be fully allocated
-- before any leg can enter the committed (待接單 or later) workflow.

alter table public.orders add column material_commitment_v2 boolean not null default false;
alter table public.orders alter column material_commitment_v2 set default true;
-- Direct DML and multi-row upserts cannot discover their order ids before
-- locking tuples in a ROW trigger. Serialize these writes at STATEMENT entry.
-- RPCs acquire the same gate before per-order locks, preserving one lock order.
create or replace function private.lock_material_writes()
returns void language sql volatile security definer set search_path = pg_catalog as $gate$
  select pg_advisory_xact_lock(1937006964, 1);
$gate$;
revoke all on function private.lock_material_writes() from public, anon, authenticated;

create or replace function private.lock_material_write_statement()
returns trigger language plpgsql security definer set search_path = pg_catalog as $gate$
begin
  perform private.lock_material_writes();
  return null;
end;
$gate$;
revoke all on function private.lock_material_write_statement() from public, anon, authenticated;

-- Keep version state separate: choice/BOM writes must never lock the line
-- after acquiring the order advisory lock (direct line UPDATE locks it first).
create table private.material_line_versions (
  order_line_id uuid primary key,
  version bigint not null default 0
);
revoke all on private.material_line_versions from public, anon, authenticated;
alter table public.order_bom_requirements add column material_line_version bigint not null default 0;

create or replace function private.stamp_material_bom_version()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if row(new.order_line_id, new.ingredient_id, new.ingredient_quantity,
        new.product_quantity, new.calculated_quantity, to_jsonb(new)->'product_id')
      is not distinct from row(old.order_line_id, old.ingredient_id, old.ingredient_quantity,
        old.product_quantity, old.calculated_quantity, to_jsonb(old)->'product_id') then
      new.material_line_version := old.material_line_version;
      return new;
    end if;
  end if;
  new.material_line_version := coalesce((select version from private.material_line_versions
    where order_line_id = new.order_line_id), 0);
  return new;
end;
$$;
create trigger stamp_material_bom_version before insert or update on public.order_bom_requirements
for each row execute function private.stamp_material_bom_version();
revoke all on function private.stamp_material_bom_version() from public, anon, authenticated;

create table if not exists public.order_line_delivery_allocations (
  id uuid primary key default gen_random_uuid(),
  order_line_id uuid not null references public.order_lines(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  allocated_quantity numeric(14, 3) not null check (allocated_quantity > 0),
  allocation_source text not null default 'automatic'
    check (allocation_source in ('automatic', 'line_delivery_id', 'explicit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_line_id, delivery_id)
);

create index if not exists order_line_delivery_allocations_delivery_idx
  on public.order_line_delivery_allocations (delivery_id, order_line_id);

alter table public.order_line_delivery_allocations enable row level security;
revoke all on public.order_line_delivery_allocations from public, anon, authenticated;
grant all on public.order_line_delivery_allocations to service_role;

alter table public.order_material_consumptions
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text,
  add column if not exists revision integer not null default 1;

alter table public.order_material_consumptions
  drop constraint if exists order_material_consumptions_order_line_id_ingredient_id_key;

create unique index if not exists order_material_consumptions_active_delivery_line_item_idx
  on public.order_material_consumptions (delivery_id, order_line_id, ingredient_id)
  where reversed_at is null;

create index if not exists order_material_consumptions_active_order_idx
  on public.order_material_consumptions (order_id, delivery_id)
  where reversed_at is null;

create or replace function private.delivery_material_is_committed(p_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_status, '') in (
    '待接單', '待取貨', '送貨途中', '已取', '已取貨', '已送達', '己送達'
  );
$$;

-- Canonical catering BOM calculation.  Stored order snapshots win; current
-- product/package recipes fill only ingredient ids absent from that snapshot.
create or replace function private.catering_line_material_requirements(
  p_order_line_id uuid
)
returns table (
  ingredient_id uuid,
  required_quantity numeric,
  calculation_source text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with selected_line as (
    select line.*
    from public.order_lines line
    where line.id = p_order_line_id and line.is_void is false
  ), snapshot as (
    select requirement.ingredient_id,
      sum(coalesce(
        requirement.calculated_quantity / nullif(requirement.product_quantity, 0) * line.quantity,
        requirement.ingredient_quantity * coalesce(line.quantity, 0),
        requirement.calculated_quantity,
        0
      ))::numeric as required_quantity
    from selected_line line
    join public.order_bom_requirements requirement
      on requirement.order_line_id = line.id
    where requirement.ingredient_id is not null
      and requirement.material_line_version = coalesce((select version
        from private.material_line_versions where order_line_id = line.id), 0)
      and coalesce(requirement.calculated_quantity, requirement.ingredient_quantity) is not null
    group by requirement.ingredient_id
  ), fallback as (
    select recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(line.quantity, 0))::numeric as required_quantity,
      'product_bom'::text as calculation_source
    from selected_line line
    join public.product_ingredients recipe on recipe.product_id = line.product_id
    where recipe.ingredient_id is not null
      and not exists (
        select 1 from snapshot where snapshot.ingredient_id = recipe.ingredient_id
      )
    group by recipe.ingredient_id

    union all

    select recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(line.quantity, 0))::numeric,
      'package_bom'::text
    from selected_line line
    join public.product_ingredients recipe on recipe.package_id = line.package_id
    where recipe.ingredient_id is not null
      and not exists (
        select 1 from snapshot where snapshot.ingredient_id = recipe.ingredient_id
      )
    group by recipe.ingredient_id

    union all

    select recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(package_product.quantity, 1)
        * coalesce(line.quantity, 0))::numeric,
      'package_bom'::text
    from selected_line line
    join public.order_package_choice_snapshots choice
      on choice.order_line_id = line.id and choice.is_selected
    join public.package_products package_product
      on package_product.id = choice.package_product_id
      and package_product.package_id = line.package_id
    join public.product_ingredients recipe
      on recipe.product_id = package_product.product_id
    where recipe.ingredient_id is not null
      and not exists (
        select 1 from snapshot where snapshot.ingredient_id = recipe.ingredient_id
      )
    group by recipe.ingredient_id

    union all

    select recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(package_product.quantity, 1)
        * coalesce(line.quantity, 0))::numeric,
      'package_bom'::text
    from selected_line line
    join public.package_products package_product
      on package_product.package_id = line.package_id and package_product.is_selected
    join public.product_ingredients recipe
      on recipe.product_id = package_product.product_id
    where not exists (
        select 1 from public.order_package_choice_snapshots choice
        left join public.package_products chosen on chosen.id = choice.package_product_id
        where choice.order_line_id = line.id
          and coalesce(chosen.package_id, choice.package_id) = line.package_id
      )
      and recipe.ingredient_id is not null
      and not exists (
        select 1 from snapshot where snapshot.ingredient_id = recipe.ingredient_id
      )
    group by recipe.ingredient_id
  ), combined as (
    select snapshot.ingredient_id, snapshot.required_quantity,
      'order_bom'::text as calculation_source
    from snapshot
    union all
    select fallback.ingredient_id, fallback.required_quantity,
      fallback.calculation_source
    from fallback
  )
  select combined.ingredient_id,
    sum(combined.required_quantity)::numeric,
    case
      when bool_or(combined.calculation_source = 'order_bom') then 'order_bom'
      when bool_or(combined.calculation_source = 'package_bom') then 'package_bom'
      else 'product_bom'
    end
  from combined
  group by combined.ingredient_id
  having sum(combined.required_quantity) > 0;
$$;

-- Allocate the rounded line total once, in stable delivery-id order. Include
-- cancelled and committed legs so filtering dates/statuses never moves a tail.
create or replace function private.catering_delivery_material_requirements(p_order_line_id uuid)
returns table (delivery_id uuid, ingredient_id uuid, required_quantity numeric, calculation_source text)
language sql stable security definer set search_path = public, private, pg_temp as $$
  with shares as (
    select allocation.delivery_id,
      sum(allocation.allocated_quantity) over (order by allocation.delivery_id) as through_quantity,
      coalesce(sum(allocation.allocated_quantity) over (
        order by allocation.delivery_id rows between unbounded preceding and 1 preceding
      ), 0) as before_quantity
    from public.order_line_delivery_allocations allocation
    where allocation.order_line_id = p_order_line_id
  )
  select shares.delivery_id, requirement.ingredient_id,
    round(requirement.required_quantity * shares.through_quantity / nullif(line.quantity, 0), 3)
      - round(requirement.required_quantity * shares.before_quantity / nullif(line.quantity, 0), 3),
    requirement.calculation_source
  from public.order_lines line
  cross join shares
  cross join lateral private.catering_line_material_requirements(line.id) requirement
  where line.id = p_order_line_id and line.quantity > 0;
$$;
revoke all on function private.catering_delivery_material_requirements(uuid) from public, anon, authenticated;

create or replace function private.sync_order_line_delivery_allocations(
  p_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_rows integer := 0;
  v_changed integer := 0;
begin
  if not exists (select 1 from public.orders where id = p_order_id and material_commitment_v2) then
    return 0;
  end if;
  delete from public.order_line_delivery_allocations allocation
  using public.order_lines line
  where allocation.order_line_id = line.id
    and line.order_id = p_order_id
    and allocation.allocation_source <> 'explicit'
    and not exists (select 1 from public.deliveries d where d.id = allocation.delivery_id
      and coalesce(d.delivery_status, '') in ('已取消', '取消', 'Cancelled', 'cancelled'));

  insert into public.order_line_delivery_allocations (
    order_line_id, delivery_id, allocated_quantity, allocation_source
  )
  select line.id, line.delivery_id, line.quantity, 'line_delivery_id'
  from public.order_lines line
  join public.deliveries delivery
    on delivery.id = line.delivery_id and delivery.order_id = line.order_id
  where line.order_id = p_order_id
    and line.is_void is false
    and coalesce(line.quantity, 0) > 0
    and line.delivery_id is not null
    and not exists (
      select 1 from public.order_line_delivery_allocations explicit
      where explicit.order_line_id = line.id
        and explicit.allocation_source = 'explicit'
    )
  on conflict (order_line_id, delivery_id) do update
  set allocated_quantity = excluded.allocated_quantity,
      allocation_source = excluded.allocation_source,
      updated_at = now();
  get diagnostics v_changed = row_count;
  v_rows := v_rows + v_changed;

  insert into public.order_line_delivery_allocations (
    order_line_id, delivery_id, allocated_quantity, allocation_source
  )
  select line.id, matched.id, line.quantity, 'automatic'
  from public.order_lines line
  join lateral (
    select (array_agg(delivery.id order by delivery.id))[1] as id
    from public.deliveries delivery
    where delivery.order_id = line.order_id
      and delivery.delivery_at = line.delivery_at
      and coalesce(delivery.delivery_status, '') not in
        ('已取消', '取消', 'Cancelled', 'cancelled')
    having count(*) = 1
  ) matched on true
  where line.order_id = p_order_id
    and line.is_void is false
    and coalesce(line.quantity, 0) > 0
    and line.delivery_id is null
    and line.delivery_at is not null
    and not exists (
      select 1 from public.order_line_delivery_allocations existing
      where existing.order_line_id = line.id
    )
  on conflict (order_line_id, delivery_id) do nothing;
  get diagnostics v_changed = row_count;
  v_rows := v_rows + v_changed;

  insert into public.order_line_delivery_allocations (
    order_line_id, delivery_id, allocated_quantity, allocation_source
  )
  select line.id, only_delivery.id, line.quantity, 'automatic'
  from public.order_lines line
  join lateral (
    select (array_agg(delivery.id order by delivery.id))[1] as id
    from public.deliveries delivery
    where delivery.order_id = line.order_id
      and coalesce(delivery.delivery_status, '') not in
        ('已取消', '取消', 'Cancelled', 'cancelled')
    having count(*) = 1
  ) only_delivery on only_delivery.id is not null
  where line.order_id = p_order_id
    and line.is_void is false
    and coalesce(line.quantity, 0) > 0
    and not exists (
      select 1 from public.order_line_delivery_allocations existing
      where existing.order_line_id = line.id
    )
  on conflict (order_line_id, delivery_id) do nothing;
  get diagnostics v_changed = row_count;
  return v_rows + v_changed;
end;
$$;

create or replace function private.assert_order_line_delivery_allocations(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_line_id uuid;
begin
  select line.id into v_line_id
  from public.order_lines line
  where line.order_id = p_order_id
    and line.is_void is false
    and coalesce(line.quantity, 0) > 0
    and (
      line.product_id is not null or line.package_id is not null
      or exists (
        select 1 from private.catering_line_material_requirements(line.id)
      )
    )
    and coalesce((
      select sum(allocation.allocated_quantity)
      from public.order_line_delivery_allocations allocation
      where allocation.order_line_id = line.id
    ), 0) <> line.quantity
  order by line.item_order nulls last, line.id
  limit 1;

  if v_line_id is not null then
    raise exception 'order_line_delivery_allocation_required:%', v_line_id
      using errcode = '23514';
  end if;
end;
$$;

-- Declaration placeholder so the allocation interface can call the module
-- before the full reconciliation implementation is installed below.
create or replace function private.reconcile_order_material_consumption(
  p_order_id uuid,
  p_reason text default 'order_changed_after_commitment'
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  raise exception 'material_reconciliation_not_installed';
end;
$$;

create or replace function public.set_order_line_delivery_allocations(
  p_order_line_id uuid,
  p_allocations jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order_id uuid;
  v_line_quantity numeric;
  v_total numeric;
  v_rows integer;
begin
  if not private.has_page_manage('orders') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;

  select line.order_id into v_order_id
  from public.order_lines line
  where line.id = p_order_line_id;
  if not found then raise exception 'order_line_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.orders where id = v_order_id and material_commitment_v2) then
    raise exception 'delivery_allocation_legacy_order' using errcode = '22023';
  end if;
  perform private.lock_material_writes();
  perform pg_advisory_xact_lock(hashtextextended(v_order_id::text, 0));
  -- All material writers serialize on the order advisory lock. Do not take
  -- a line tuple lock: a direct UPDATE may already hold it while its BEFORE
  -- trigger waits on this advisory lock. Read the latest quantity after waiting.
  select line.quantity into v_line_quantity from public.order_lines line
  where line.id = p_order_line_id and line.order_id = v_order_id;
  if not found then raise exception 'order_line_not_found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_allocations) is distinct from 'array'
    or jsonb_array_length(p_allocations) = 0 then
    raise exception 'delivery_allocations_required' using errcode = '22023';
  end if;

  select sum((entry ->> 'quantity')::numeric) into v_total
  from jsonb_array_elements(p_allocations) entry;
  if v_total is distinct from v_line_quantity then
    raise exception 'delivery_allocation_total_mismatch' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_allocations) entry
    left join public.deliveries delivery
      on delivery.id = (entry ->> 'delivery_id')::uuid
      and delivery.order_id = v_order_id
    where delivery.id is null or (entry ->> 'quantity')::numeric is null
      or (entry ->> 'quantity')::numeric <= 0
  ) then
    raise exception 'delivery_allocation_invalid' using errcode = '22023';
  end if;

  delete from public.order_line_delivery_allocations
  where order_line_id = p_order_line_id;

  insert into public.order_line_delivery_allocations (
    order_line_id, delivery_id, allocated_quantity, allocation_source
  )
  select p_order_line_id, (entry ->> 'delivery_id')::uuid,
    (entry ->> 'quantity')::numeric, 'explicit'
  from jsonb_array_elements(p_allocations) entry;
  get diagnostics v_rows = row_count;

  return v_rows;
end;
$$;

-- Forward declaration used by the public allocation function above.
-- PostgreSQL resolves the body at execution time; the implementation follows.
create or replace function private.reverse_order_material_consumptions(
  p_order_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_rows integer;
begin
  update public.order_material_consumptions
  set reversed_at = now(), reversal_reason = nullif(btrim(p_reason), '')
  where order_id = p_order_id and reversed_at is null;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function private.record_delivered_delivery_material_consumption(
  p_delivery_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order_id uuid;
  v_consumed_at timestamptz;
  v_revision integer;
  v_inserted integer := 0;
begin
  select delivery.order_id,
    now()
  into v_order_id, v_consumed_at
  from public.deliveries delivery
  join public.orders orders on orders.id = delivery.order_id
  where delivery.id = p_delivery_id
    and private.delivery_material_is_committed(delivery.delivery_status)
    and orders.document_type = 'order'
    and orders.material_commitment_v2
    and orders.archived_at is null
    and orders.merged_into_order_id is null
    and coalesce(orders.delivery_status, '') not in
      ('已取消', '取消', 'Cancelled', 'cancelled')
    and not exists (
      select 1 from public.order_list_manual_todos todo
      where todo.order_id = orders.id and todo.todo_key = 'cancelled'
    );
  if not found then return 0; end if;

  perform private.sync_order_line_delivery_allocations(v_order_id);
  perform private.assert_order_line_delivery_allocations(v_order_id);

  select coalesce(max(consumption.revision), 0) + 1 into v_revision
  from public.order_material_consumptions consumption
  where consumption.order_id = v_order_id;

  insert into public.order_material_consumptions (
    order_id, delivery_id, order_line_id, ingredient_id, quantity,
    consumed_at, calculation_source, metadata, revision
  )
  select v_order_id, p_delivery_id, line.id, requirement.ingredient_id,
    requirement.required_quantity,
    v_consumed_at, requirement.calculation_source,
    jsonb_build_object(
      'deliveryCommitted', true,
      'deliveryId', p_delivery_id,
      'allocatedQuantity', allocation.allocated_quantity
    ),
    v_revision
  from public.order_line_delivery_allocations allocation
  join public.order_lines line on line.id = allocation.order_line_id
  join lateral private.catering_delivery_material_requirements(line.id) requirement
    on requirement.delivery_id = allocation.delivery_id
  where allocation.delivery_id = p_delivery_id
    and line.is_void is false
    and coalesce(line.quantity, 0) > 0
    and requirement.required_quantity > 0
  on conflict (delivery_id, order_line_id, ingredient_id)
    where reversed_at is null do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Existing orders keep the prior whole-line delivery matching policy. Do not
-- silently turn off their deductions when installing the v2 trigger family.
create or replace function private.reconcile_legacy_material_consumption(p_order_id uuid, p_reason text)
returns integer language plpgsql security definer set search_path=public,private,pg_temp as $legacy$
declare v_delivery record; v_rows integer:=0; v_added integer;
begin
  perform private.lock_material_writes();
  update public.order_material_consumptions consumption
    set reversed_at=now(), reversal_reason=p_reason
  where consumption.order_id=p_order_id and consumption.reversed_at is null
    and not exists (
      select 1 from public.orders orders join public.deliveries delivery on delivery.order_id=orders.id
      where orders.id=p_order_id and delivery.id=consumption.delivery_id
        and orders.document_type='order' and orders.archived_at is null and orders.merged_into_order_id is null
        and coalesce(orders.delivery_status,'') not in ('已取消','取消','Cancelled','cancelled')
        and private.delivery_material_is_committed(delivery.delivery_status)
        and not exists(select 1 from public.order_list_manual_todos where order_id=orders.id and todo_key='cancelled')
    );
  for v_delivery in select delivery.* from public.deliveries delivery join public.orders orders on orders.id=delivery.order_id
    where orders.id=p_order_id and orders.document_type='order' and orders.archived_at is null and orders.merged_into_order_id is null
      and coalesce(orders.delivery_status,'') not in ('已取消','取消','Cancelled','cancelled')
      and private.delivery_material_is_committed(delivery.delivery_status)
      and not exists(select 1 from public.order_list_manual_todos where order_id=orders.id and todo_key='cancelled')
    order by delivery.delivery_at nulls last,delivery.id
  loop
    insert into public.order_material_consumptions(order_id,delivery_id,order_line_id,ingredient_id,quantity,consumed_at,calculation_source)
      select p_order_id,v_delivery.id,line.id,requirement.ingredient_id,requirement.required_quantity,
        now(),requirement.calculation_source
      from public.order_lines line
      cross join lateral private.catering_line_material_requirements(line.id) requirement
      where line.order_id=p_order_id and not line.is_void and line.quantity>0
        and (line.delivery_id=v_delivery.id
          or (line.delivery_id is null and line.delivery_at=v_delivery.delivery_at)
          or (line.delivery_id is null and line.delivery_at is null and
            (select count(*) from public.deliveries where order_id=p_order_id
              and coalesce(delivery_status,'') not in ('已取消','取消','Cancelled','cancelled'))=1))
        and round(requirement.required_quantity,3)>0
        and not exists(select 1 from public.order_material_consumptions prior
          where prior.order_line_id=line.id and prior.ingredient_id=requirement.ingredient_id and prior.reversed_at is null);
    get diagnostics v_added=row_count;
    v_rows:=v_rows+v_added;
  end loop;
  return v_rows;
end;
$legacy$;
revoke all on function private.reconcile_legacy_material_consumption(uuid,text) from public,anon,authenticated;

create or replace function private.reconcile_order_material_consumption(
  p_order_id uuid,
  p_reason text default 'order_changed_after_commitment'
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_delivery record;
  v_rows integer := 0;
begin
  if not exists (select 1 from public.orders where id=p_order_id) then return 0; end if;
  if exists (select 1 from public.orders where id=p_order_id and not material_commitment_v2) then
    return private.reconcile_legacy_material_consumption(p_order_id,p_reason);
  end if;
  perform private.lock_material_writes();
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));
  perform private.sync_order_line_delivery_allocations(p_order_id);

  -- Repeated deferred triggers and status updates must be true no-ops when
  -- the final committed demand has not changed.
  if not exists (
    with desired as (
      select allocation.delivery_id, line.id as order_line_id,
        requirement.ingredient_id,
        requirement.required_quantity as quantity
      from public.order_line_delivery_allocations allocation
      join public.order_lines line on line.id = allocation.order_line_id
      join public.deliveries delivery on delivery.id = allocation.delivery_id
      join public.orders orders on orders.id = line.order_id
      join lateral private.catering_delivery_material_requirements(line.id) requirement
        on requirement.delivery_id = allocation.delivery_id
      where orders.id = p_order_id and orders.document_type = 'order'
        and orders.archived_at is null and orders.merged_into_order_id is null
        and coalesce(orders.delivery_status, '') not in ('已取消', '取消', 'Cancelled', 'cancelled')
        and private.delivery_material_is_committed(delivery.delivery_status)
        and not exists (select 1 from public.order_list_manual_todos todo
          where todo.order_id = orders.id and todo.todo_key = 'cancelled')
        and coalesce(line.quantity, 0) > 0
        and requirement.required_quantity > 0
    ), actual as (
      select delivery_id, order_line_id, ingredient_id, quantity
      from public.order_material_consumptions
      where order_id = p_order_id and reversed_at is null
    )
    (select * from desired except select * from actual)
    union all
    (select * from actual except select * from desired)
  ) then
    if exists (select 1 from public.deliveries where order_id = p_order_id
      and private.delivery_material_is_committed(delivery_status)) then
      perform private.assert_order_line_delivery_allocations(p_order_id);
    end if;
    return 0;
  end if;

  perform private.reverse_order_material_consumptions(p_order_id, p_reason);

  for v_delivery in
    select delivery.id
    from public.deliveries delivery
    where delivery.order_id = p_order_id
      and private.delivery_material_is_committed(delivery.delivery_status)
    order by delivery.delivery_at nulls last, delivery.id
  loop
    v_rows := v_rows
      + private.record_delivered_delivery_material_consumption(v_delivery.id);
  end loop;
  return v_rows;
end;
$$;

-- One dispatch rule for every aggregate event, including the last cancelled leg.
create or replace function private.refresh_material_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $refresh$
begin
  if p_order_id is null then return; end if;
  if exists (select 1 from public.deliveries where order_id=p_order_id
      and private.delivery_material_is_committed(delivery_status))
    or exists (select 1 from public.order_material_consumptions where order_id=p_order_id and reversed_at is null) then
    perform private.reconcile_order_material_consumption(p_order_id,p_reason);
  else
    perform private.sync_order_line_delivery_allocations(p_order_id);
  end if;
end;
$refresh$;
revoke all on function private.refresh_material_order(uuid,text) from public,anon,authenticated;

-- Keep automatic allocations current before commitment; after commitment,
-- every material-affecting edit is reversed and recalculated transactionally.
create or replace function private.reconcile_materials_after_order_line_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.refresh_material_order(coalesce(new.order_id,old.order_id), 'order_line_changed');
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists reconcile_materials_after_order_line_change on public.order_lines;
create constraint trigger reconcile_materials_after_order_line_change
after insert or delete or update on public.order_lines
deferrable initially deferred
for each row execute function private.reconcile_materials_after_order_line_change();

create or replace function private.reconcile_materials_after_bom_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_order_id uuid;
begin
  for v_order_id in
    select distinct id from (
      select old.order_id as id union all select new.order_id
      union all select order_id from public.order_lines
        where id in (old.order_line_id, new.order_line_id)
    ) affected where id is not null order by id
  loop
    perform private.refresh_material_order(v_order_id, 'bom_changed');
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists reconcile_materials_after_bom_change on public.order_bom_requirements;
create constraint trigger reconcile_materials_after_bom_change
after insert or update or delete on public.order_bom_requirements
deferrable initially deferred
for each row execute function private.reconcile_materials_after_bom_change();

drop trigger if exists reconcile_materials_after_package_choice_change
  on public.order_package_choice_snapshots;
create constraint trigger reconcile_materials_after_package_choice_change
after insert or update or delete on public.order_package_choice_snapshots
deferrable initially deferred
for each row execute function private.reconcile_materials_after_bom_change();

create or replace function private.consume_materials_when_delivery_fulfilled()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_order_id uuid;
begin
  if tg_op = 'UPDATE' and row(old.delivery_status, old.delivery_at, old.order_id)
    is not distinct from row(new.delivery_status, new.delivery_at, new.order_id) then return new; end if;
  for v_order_id in select distinct id from unnest(array[old.order_id,new.order_id]) id
    where id is not null order by id
  loop
    perform private.refresh_material_order(v_order_id, 'delivery_changed');
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists consume_materials_when_delivery_fulfilled on public.deliveries;
create constraint trigger consume_materials_when_delivery_fulfilled
after insert or update or delete on public.deliveries
deferrable initially deferred
for each row execute function private.consume_materials_when_delivery_fulfilled();

create or replace function private.reconcile_materials_after_order_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if row(old.delivery_status,old.archived_at,old.merged_into_order_id,old.document_type,old.delivery_at)
    is distinct from row(new.delivery_status,new.archived_at,new.merged_into_order_id,new.document_type,new.delivery_at) then
    perform private.refresh_material_order(new.id, 'order_changed');
  end if;
  return new;
end;
$$;

drop trigger if exists reconcile_materials_after_order_change on public.orders;
create constraint trigger reconcile_materials_after_order_change
after update on public.orders
deferrable initially deferred
for each row execute function private.reconcile_materials_after_order_change();

-- The old order-level delivery trigger must not race the canonical module.
drop trigger if exists consume_materials_when_order_delivered on public.orders;

create or replace function private.reconcile_materials_after_cancellation_tag()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_order_id uuid;
begin
  if old.todo_key = 'cancelled' or new.todo_key = 'cancelled' then
    for v_order_id in select distinct id from unnest(array[old.order_id,new.order_id]) id
      where id is not null order by id
    loop
      perform private.refresh_material_order(v_order_id, 'order_cancellation_changed');
    end loop;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create constraint trigger reconcile_materials_after_cancellation_tag
after insert or update or delete on public.order_list_manual_todos
deferrable initially deferred
for each row execute function private.reconcile_materials_after_cancellation_tag();
revoke all on function private.reconcile_materials_after_cancellation_tag()
  from public, anon, authenticated;

revoke all on function private.delivery_material_is_committed(text)
  from public, anon, authenticated;
revoke all on function private.catering_line_material_requirements(uuid)
  from public, anon, authenticated;
revoke all on function private.sync_order_line_delivery_allocations(uuid)
  from public, anon, authenticated;
revoke all on function private.assert_order_line_delivery_allocations(uuid)
  from public, anon, authenticated;
revoke all on function private.reverse_order_material_consumptions(uuid, text)
  from public, anon, authenticated;
revoke all on function private.record_delivered_delivery_material_consumption(uuid)
  from public, anon, authenticated;
revoke all on function private.reconcile_order_material_consumption(uuid, text)
  from public, anon, authenticated;
revoke all on function private.reconcile_materials_after_order_line_change()
  from public, anon, authenticated;
revoke all on function private.reconcile_materials_after_bom_change()
  from public, anon, authenticated;
revoke all on function private.consume_materials_when_delivery_fulfilled()
  from public, anon, authenticated;
revoke all on function private.reconcile_materials_after_order_change()
  from public, anon, authenticated;
revoke all on function public.set_order_line_delivery_allocations(uuid, jsonb)
  from public, anon;
grant execute on function public.set_order_line_delivery_allocations(uuid, jsonb)
  to authenticated;

comment on table public.order_line_delivery_allocations is
  'Canonical quantity allocation of a catering order line across delivery legs.';
comment on function public.set_order_line_delivery_allocations(uuid, jsonb) is
  'Replaces one line allocation atomically; quantities must total the line quantity.';

-- Lock the order before changing any member of its commitment aggregate.
create or replace function private.lock_material_order_change()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_order_id uuid; v_previous_order_id uuid;
begin
  if tg_table_name = 'orders' then
    v_order_id := new.id;
  elsif tg_table_name = 'order_line_delivery_allocations' then
    select order_id into v_order_id from public.order_lines
      where id = coalesce(new.order_line_id, old.order_line_id);
  else
    v_order_id := coalesce(new.order_id, old.order_id);
    if tg_op = 'UPDATE' then v_previous_order_id := old.order_id; end if;
    if v_order_id is null and tg_table_name in ('order_bom_requirements', 'order_package_choice_snapshots') then
      select order_id into v_order_id from public.order_lines
        where id = coalesce(new.order_line_id, old.order_line_id);
    end if;
  end if;
  if v_order_id is not null then
    perform private.lock_material_writes();
  perform pg_advisory_xact_lock(hashtextextended(v_order_id::text, 0));
  end if;
  if tg_table_name in ('order_lines','deliveries') and tg_op='UPDATE' then
    if old.order_id is not null and old.order_id is distinct from new.order_id then
      raise exception 'material_order_line_move_requires_void_and_copy' using errcode='23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger lock_material_order_change before update on public.orders
for each row execute function private.lock_material_order_change();
create trigger lock_material_order_change before insert or update or delete on public.order_lines
for each row execute function private.lock_material_order_change();
create trigger lock_material_order_change before insert or update or delete on public.deliveries
for each row execute function private.lock_material_order_change();
create trigger lock_material_order_change before insert or update or delete on public.order_bom_requirements
for each row execute function private.lock_material_order_change();
create trigger lock_material_order_change before insert or update or delete on public.order_package_choice_snapshots
for each row execute function private.lock_material_order_change();
create trigger lock_material_order_change before insert or update or delete on public.order_list_manual_todos
for each row execute function private.lock_material_order_change();

create or replace function private.update_material_line_version()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
begin
  if old.product_id is distinct from new.product_id or old.package_id is distinct from new.package_id then
    insert into private.material_line_versions(order_line_id, version) values (new.id, 1)
    on conflict (order_line_id) do update set version = material_line_versions.version + 1;
  end if;
  if old.quantity is distinct from new.quantity and coalesce(new.quantity, 0) > 0 then
    with weights as (
      select id, allocated_quantity,
        sum(allocated_quantity) over () as total,
        row_number() over (order by delivery_id) as position,
        count(*) over () as count
      from public.order_line_delivery_allocations where order_line_id = new.id
        and allocation_source = 'explicit'
    ), balanced as (
      -- Differences of rounded cumulative shares preserve the exact total,
      -- remain non-negative, and work even below the number of delivery legs.
      select id,
        round(new.quantity * sum(allocated_quantity) over (order by position) / total, 3)
        - round(new.quantity * coalesce(sum(allocated_quantity) over (
          order by position rows between unbounded preceding and 1 preceding
        ), 0) / total, 3) as quantity
      from weights
    ), removed as (
      delete from public.order_line_delivery_allocations allocation
      using balanced where allocation.id = balanced.id and balanced.quantity = 0
      returning allocation.id
    )
    update public.order_line_delivery_allocations allocation
    set allocated_quantity = balanced.quantity, updated_at = now()
    from balanced where allocation.id = balanced.id and balanced.quantity > 0;
  end if;
  return new;
end;
$$;
create trigger update_material_line_version before update on public.order_lines
for each row execute function private.update_material_line_version();

-- A changed package choice invalidates the old imported BOM snapshot.
create or replace function private.invalidate_material_package_snapshot()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_line_id uuid;
begin
  if tg_op = 'UPDATE' then
    if row(new.order_line_id, new.package_product_id, new.package_id, new.is_selected)
      is not distinct from row(old.order_line_id, old.package_product_id, old.package_id, old.is_selected) then
      return new;
    end if;
  end if;
  -- Imports may not have linked a line yet. A move invalidates both lines.
  for v_line_id in
    select distinct id from unnest(array[old.order_line_id, new.order_line_id]) id
    where id is not null order by id
  loop
    insert into private.material_line_versions(order_line_id, version) values (v_line_id, 1)
    on conflict (order_line_id) do update set version = material_line_versions.version + 1;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger invalidate_material_package_snapshot after insert or update or delete on public.order_package_choice_snapshots
for each row execute function private.invalidate_material_package_snapshot();

drop trigger if exists refresh_minimum_after_material_consumption on public.order_material_consumptions;
create constraint trigger refresh_minimum_after_material_consumption
after insert or update on public.order_material_consumptions
deferrable initially deferred
for each row execute function private.refresh_minimum_after_material_consumption();

create or replace function public.get_order_line_delivery_allocations(p_order_id uuid)
returns table (order_line_id uuid, delivery_id uuid, allocated_quantity numeric, allocation_source text)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if not private.has_page_access('orders') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query select a.order_line_id, a.delivery_id, a.allocated_quantity, a.allocation_source
  from public.order_line_delivery_allocations a
  join public.order_lines l on l.id = a.order_line_id where l.order_id = p_order_id;
end;
$$;
revoke all on function private.lock_material_order_change() from public, anon, authenticated;
revoke all on function private.update_material_line_version() from public, anon, authenticated;
revoke all on function private.invalidate_material_package_snapshot() from public, anon, authenticated;
revoke all on function public.get_order_line_delivery_allocations(uuid) from public, anon;
grant execute on function public.get_order_line_delivery_allocations(uuid) to authenticated;

create or replace function public.set_order_delivery_allocations(p_order_id uuid, p_lines jsonb)
returns integer language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_line jsonb; v_count integer := 0;
begin
  if not private.has_page_manage('orders') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  perform private.lock_material_writes();
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'delivery_allocations_required' using errcode = '22023';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if not exists (select 1 from public.order_lines where id = (v_line->>'order_line_id')::uuid
      and order_id = p_order_id) then
      raise exception 'delivery_allocation_invalid' using errcode = '22023';
    end if;
    v_count := v_count + public.set_order_line_delivery_allocations(
      (v_line->>'order_line_id')::uuid, v_line->'allocations');
  end loop;
  perform private.reconcile_order_material_consumption(p_order_id, 'delivery_allocation_changed');
  return v_count;
end;
$$;

create or replace function private.reconcile_materials_after_allocation_change()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_order_id uuid;
begin
  -- Automatic allocation maintenance is performed inside reconciliation.
  -- Only explicit user edits need an additional deferred reconciliation.
  if coalesce(new.allocation_source, old.allocation_source) = 'explicit' then
    select order_id into v_order_id from public.order_lines
      where id = coalesce(new.order_line_id, old.order_line_id);
    if v_order_id is not null then
      perform private.reconcile_order_material_consumption(v_order_id, 'delivery_allocation_changed');
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create constraint trigger reconcile_materials_after_allocation_change
after insert or update or delete on public.order_line_delivery_allocations
deferrable initially deferred
for each row execute function private.reconcile_materials_after_allocation_change();
revoke all on function private.reconcile_materials_after_allocation_change() from public, anon, authenticated;
revoke all on function public.set_order_delivery_allocations(uuid, jsonb) from public, anon;
grant execute on function public.set_order_delivery_allocations(uuid, jsonb) to authenticated;

-- Acquire the transaction gate before any row locks, including UPSERT paths.
create trigger lock_material_write_statement before insert or update or delete on public.orders
for each statement execute function private.lock_material_write_statement();
create trigger lock_material_write_statement before insert or update or delete on public.order_lines
for each statement execute function private.lock_material_write_statement();
create trigger lock_material_write_statement before insert or update or delete on public.deliveries
for each statement execute function private.lock_material_write_statement();
create trigger lock_material_write_statement before insert or update or delete on public.order_bom_requirements
for each statement execute function private.lock_material_write_statement();
create trigger lock_material_write_statement before insert or update or delete on public.order_package_choice_snapshots
for each statement execute function private.lock_material_write_statement();
create trigger lock_material_write_statement before insert or update or delete on public.order_list_manual_todos
for each statement execute function private.lock_material_write_statement();
create trigger lock_material_write_statement before insert or update or delete on public.order_line_delivery_allocations
for each statement execute function private.lock_material_write_statement();
create trigger lock_material_write_statement before insert or update or delete on public.order_material_consumptions
for each statement execute function private.lock_material_write_statement();
