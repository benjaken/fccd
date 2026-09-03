-- Factory warehouse for FC-internal shop orders: inbound receipts,
-- one shipment per request, dry-goods ledger, frozen meat reuse.
-- Do not write ingredient_stocktake_events / packing_stocktake_events.

-- Allow status updates after the delivery date (ship later than requested).
create or replace function public.shop_order_requests_set_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.request_no is null or new.request_no = '' then
    new.request_no := public.shop_order_next_request_no();
  end if;
  if tg_op = 'INSERT'
     or new.delivery_date is distinct from old.delivery_date then
    if new.delivery_date < (timezone('Asia/Hong_Kong', now()))::date then
      raise exception 'delivery_date cannot be before today';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create sequence if not exists public.shop_warehouse_receipt_no_seq;
create sequence if not exists public.shop_warehouse_shipment_no_seq;

create table if not exists public.shop_dry_stock_movements (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid references public.shop_catalog_items (id),
  sku text,
  name text not null,
  unit text not null,
  movement_type text not null check (movement_type in ('inbound', 'outbound')),
  quantity numeric not null check (quantity > 0),
  occurred_at timestamptz not null default now(),
  source_type text not null check (source_type in ('receipt', 'shipment')),
  source_id uuid not null,
  created_by uuid,
  remarks text,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create table if not exists public.shop_warehouse_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  warehouse text not null check (warehouse in ('frozen', 'dry')),
  catalog_item_id uuid references public.shop_catalog_items (id),
  sku text,
  name text not null,
  unit text not null,
  quantity numeric not null check (quantity > 0),
  supplier_id uuid references public.suppliers (id),
  source_name text,
  batch_no text,
  receipt_date date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  idempotency_key text unique,
  dry_movement_id uuid references public.shop_dry_stock_movements (id),
  meat_movement_id uuid,
  meat_kind text check (meat_kind in ('raw', 'prepared')),
  stock_warning text not null default 'ok'
);

create table if not exists public.shop_shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_no text not null unique,
  request_id uuid not null unique references public.shop_order_requests (id),
  restaurant_id uuid not null references public.restaurants (id),
  status text not null default 'in_transit',
  shipped_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  warning_flags jsonb not null default '[]'::jsonb
);

create table if not exists public.shop_shipment_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shop_shipments (id) on delete cascade,
  request_line_id uuid not null references public.shop_order_lines (id),
  catalog_item_id uuid references public.shop_catalog_items (id),
  sku text,
  name text not null,
  unit text not null,
  warehouse text check (warehouse in ('frozen', 'dry')),
  approved_quantity numeric not null,
  shipped_quantity numeric not null check (shipped_quantity > 0),
  stock_warning text not null default 'ok',
  dry_movement_id uuid references public.shop_dry_stock_movements (id),
  meat_movement_id uuid,
  meat_kind text check (meat_kind in ('raw', 'prepared')),
  created_at timestamptz not null default now(),
  unique (request_line_id),
  check (shipped_quantity <= approved_quantity)
);

create or replace function public.shop_warehouse_next_receipt_no()
returns text
language sql
as $$
  select 'WR-' || to_char(timezone('Asia/Hong_Kong', now()), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.shop_warehouse_receipt_no_seq')::text, 4, '0');
$$;

create or replace function public.shop_warehouse_next_shipment_no()
returns text
language sql
as $$
  select 'SR-' || to_char(timezone('Asia/Hong_Kong', now()), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.shop_warehouse_shipment_no_seq')::text, 4, '0');
$$;

create or replace function public.shop_estimate_kg(p_quantity numeric, p_unit text)
returns numeric
language sql
immutable
as $$
  select case
    when p_unit ~* '([0-9]+(?:\.[0-9]+)?)\s*(kg|公斤)'
      then p_quantity * (regexp_match(p_unit, '([0-9]+(?:\.[0-9]+)?)\s*(kg|公斤)', 'i'))[1]::numeric
    else p_quantity
  end;
$$;

create or replace function public.shop_dry_stock_balance(p_catalog_item_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case when movement_type = 'inbound' then quantity else -quantity end
  ), 0)
  from public.shop_dry_stock_movements
  where catalog_item_id = p_catalog_item_id;
$$;

create or replace function public.shop_lookup_frozen_item(p_sku text)
returns table(kind text, item_id uuid, legacy_id text)
language sql
stable
as $$
  select 'raw'::text, id, legacy_id
  from public.raw_meat_items
  where p_sku is not null and btrim(p_sku) <> '' and sku = p_sku
  union all
  select 'prepared'::text, id, legacy_id
  from public.prepared_meat_items
  where p_sku is not null and btrim(p_sku) <> '' and sku = p_sku
  limit 1;
$$;

create or replace function public.shop_frozen_balance(p_kind text, p_item_id uuid)
returns numeric
language sql
stable
as $$
  select case p_kind
    when 'raw' then (
      select coalesce(sum(coalesce(inbound_quantity_kg, 0) - coalesce(outbound_quantity_kg, 0)), 0)
      from public.raw_meat_stock_movements
      where raw_meat_item_id = p_item_id
    )
    when 'prepared' then (
      select coalesce(sum(coalesce(inbound_packages, 0) - coalesce(outbound_packages, 0)), 0)
      from public.prepared_meat_stock_movements
      where prepared_meat_item_id = p_item_id
    )
    else 0
  end;
$$;

create or replace function public.shop_frozen_has_ledger(p_kind text, p_item_id uuid)
returns boolean
language sql
stable
as $$
  select case p_kind
    when 'raw' then exists (
      select 1 from public.raw_meat_stock_movements where raw_meat_item_id = p_item_id
    )
    when 'prepared' then exists (
      select 1 from public.prepared_meat_stock_movements where prepared_meat_item_id = p_item_id
    )
    else false
  end;
$$;

create or replace function public.assess_shop_warehouse_stock(
  p_warehouse text,
  p_catalog_item_id uuid,
  p_sku text,
  p_unit text,
  p_quantity numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mapped boolean := false;
  v_has_ledger boolean := false;
  v_balance numeric := 0;
  v_needed numeric := coalesce(p_quantity, 0);
  v_kind text;
  v_item_id uuid;
  v_warning text;
begin
  if p_warehouse = 'dry' then
    v_mapped := true;
    v_has_ledger := exists (
      select 1 from public.shop_dry_stock_movements where catalog_item_id = p_catalog_item_id
    );
    v_balance := public.shop_dry_stock_balance(p_catalog_item_id);
  elsif p_warehouse = 'frozen' then
    select kind, item_id into v_kind, v_item_id
    from public.shop_lookup_frozen_item(p_sku);
    if v_item_id is not null then
      v_mapped := true;
      v_has_ledger := public.shop_frozen_has_ledger(v_kind, v_item_id);
      v_balance := public.shop_frozen_balance(v_kind, v_item_id);
      if v_kind = 'raw' then
        v_needed := public.shop_estimate_kg(p_quantity, p_unit);
      end if;
    end if;
  end if;

  if not v_mapped then
    v_warning := 'unmapped';
  elsif not v_has_ledger then
    v_warning := 'missing';
  elsif v_balance < v_needed then
    v_warning := 'low';
  else
    v_warning := 'ok';
  end if;

  return jsonb_build_object(
    'warning', v_warning,
    'balance', v_balance,
    'mapped', v_mapped,
    'needed', v_needed,
    'meatKind', v_kind,
    'meatItemId', v_item_id
  );
end;
$$;

create or replace function public.shop_write_frozen_movement(
  p_direction text,
  p_sku text,
  p_quantity numeric,
  p_unit text,
  p_occurred_at timestamptz,
  p_remarks text
)
returns table(movement_id uuid, meat_kind text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_item_id uuid;
  v_legacy text;
  v_id uuid;
  v_qty numeric;
begin
  select kind, item_id, legacy_id into v_kind, v_item_id, v_legacy
  from public.shop_lookup_frozen_item(p_sku);
  if v_item_id is null then
    return;
  end if;

  if v_kind = 'raw' then
    v_qty := public.shop_estimate_kg(p_quantity, p_unit);
    insert into public.raw_meat_stock_movements (
      legacy_id,
      raw_meat_item_id,
      raw_meat_item_legacy_id,
      movement_at,
      inbound_quantity_kg,
      outbound_quantity_kg,
      remarks,
      bubble_created_at,
      bubble_modified_at
    )
    values (
      'shop-wh-' || gen_random_uuid()::text,
      v_item_id,
      v_legacy,
      p_occurred_at,
      case when p_direction = 'inbound' then v_qty else null end,
      case when p_direction = 'outbound' then v_qty else null end,
      p_remarks,
      now(),
      now()
    )
    returning id into v_id;
  else
    insert into public.prepared_meat_stock_movements (
      legacy_id,
      prepared_meat_item_id,
      prepared_meat_item_legacy_id,
      movement_at,
      inbound_packages,
      outbound_packages,
      remarks,
      bubble_created_at,
      bubble_modified_at
    )
    values (
      'shop-wh-' || gen_random_uuid()::text,
      v_item_id,
      v_legacy,
      p_occurred_at,
      case when p_direction = 'inbound' then p_quantity else null end,
      case when p_direction = 'outbound' then p_quantity else null end,
      p_remarks,
      now(),
      now()
    )
    returning id into v_id;
  end if;

  movement_id := v_id;
  meat_kind := v_kind;
  return next;
end;
$$;

create or replace function public.record_shop_warehouse_receipt(
  p_catalog_item_id uuid,
  p_quantity numeric,
  p_receipt_date date,
  p_supplier_id uuid,
  p_source_name text,
  p_batch_no text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.shop_catalog_items%rowtype;
  v_existing public.shop_warehouse_receipts%rowtype;
  v_id uuid;
  v_dry_id uuid;
  v_meat_id uuid;
  v_meat_kind text;
  v_assessment jsonb;
  v_occurred timestamptz;
begin
  if not private.has_page_access('workspace.factory.warehouse') then
    raise exception 'not authorized for factory warehouse'
      using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.shop_warehouse_receipts
    where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('id', v_existing.id, 'receiptNo', v_existing.receipt_no, 'replayed', true);
    end if;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than 0' using errcode = '22023';
  end if;

  select * into v_item from public.shop_catalog_items where id = p_catalog_item_id;
  if not found or v_item.channel <> 'fc_internal' or v_item.warehouse is null then
    raise exception 'catalog item is not an FC internal warehouse item'
      using errcode = '22023';
  end if;

  v_occurred := (p_receipt_date::timestamp at time zone 'Asia/Hong_Kong');
  v_assessment := public.assess_shop_warehouse_stock(
    v_item.warehouse, v_item.id, v_item.sku, v_item.unit, p_quantity
  );

  insert into public.shop_warehouse_receipts (
    receipt_no, warehouse, catalog_item_id, sku, name, unit, quantity,
    supplier_id, source_name, batch_no, receipt_date, created_by,
    idempotency_key, stock_warning
  )
  values (
    public.shop_warehouse_next_receipt_no(),
    v_item.warehouse,
    v_item.id,
    v_item.sku,
    v_item.name,
    v_item.unit,
    p_quantity,
    p_supplier_id,
    nullif(btrim(coalesce(p_source_name, '')), ''),
    nullif(btrim(coalesce(p_batch_no, '')), ''),
    p_receipt_date,
    auth.uid(),
    p_idempotency_key,
    coalesce(v_assessment ->> 'warning', 'ok')
  )
  returning id into v_id;

  if v_item.warehouse = 'dry' then
    insert into public.shop_dry_stock_movements (
      catalog_item_id, sku, name, unit, movement_type, quantity,
      occurred_at, source_type, source_id, created_by, remarks
    )
    values (
      v_item.id, v_item.sku, v_item.name, v_item.unit, 'inbound', p_quantity,
      v_occurred, 'receipt', v_id, auth.uid(), 'shop warehouse inbound'
    )
    returning id into v_dry_id;
    update public.shop_warehouse_receipts
    set dry_movement_id = v_dry_id
    where id = v_id;
  else
    select movement_id, meat_kind into v_meat_id, v_meat_kind
    from public.shop_write_frozen_movement(
      'inbound', v_item.sku, p_quantity, v_item.unit, v_occurred,
      'shop-warehouse:receipt:' || v_id::text
    );
    update public.shop_warehouse_receipts
    set meat_movement_id = v_meat_id, meat_kind = v_meat_kind
    where id = v_id;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'receiptNo', (select receipt_no from public.shop_warehouse_receipts where id = v_id),
    'warning', coalesce(v_assessment ->> 'warning', 'ok'),
    'replayed', false
  );
end;
$$;

create or replace function public.assess_shop_warehouse_request(
  p_request_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_request public.shop_order_requests%rowtype;
  v_line jsonb;
  v_order_line public.shop_order_lines%rowtype;
  v_qty numeric;
  v_rows jsonb := '[]'::jsonb;
begin
  if not private.has_page_access('workspace.factory.warehouse') then
    raise exception 'not authorized for factory warehouse'
      using errcode = '42501';
  end if;

  select * into v_request from public.shop_order_requests where id = p_request_id;
  if not found then
    raise exception 'shop order request not found' using errcode = 'P0002';
  end if;

  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    select * into v_order_line
    from public.shop_order_lines
    where id = (v_line ->> 'request_line_id')::uuid
      and request_id = p_request_id;
    if not found then
      continue;
    end if;
    v_qty := coalesce((v_line ->> 'quantity')::numeric, v_order_line.quantity);
    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object(
        'requestLineId', v_order_line.id,
        'quantity', v_qty
      ) || public.assess_shop_warehouse_stock(
        v_order_line.warehouse,
        v_order_line.catalog_item_id,
        v_order_line.sku,
        v_order_line.unit,
        v_qty
      )
    );
  end loop;

  return jsonb_build_object('lines', v_rows);
end;
$$;

create or replace function public.ship_shop_order_request(
  p_request_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.shop_order_requests%rowtype;
  v_existing public.shop_shipments%rowtype;
  v_shipment_id uuid;
  v_line jsonb;
  v_order_line public.shop_order_lines%rowtype;
  v_qty numeric;
  v_assessment jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_line_id uuid;
  v_dry_id uuid;
  v_meat_id uuid;
  v_meat_kind text;
  v_occurred timestamptz := now();
begin
  if not private.has_page_access('workspace.factory.warehouse') then
    raise exception 'not authorized for factory warehouse'
      using errcode = '42501';
  end if;

  select * into v_existing from public.shop_shipments where request_id = p_request_id;
  if found then
    return jsonb_build_object(
      'id', v_existing.id,
      'shipmentNo', v_existing.shipment_no,
      'replayed', true
    );
  end if;

  select * into v_request from public.shop_order_requests where id = p_request_id;
  if not found then
    raise exception 'shop order request not found' using errcode = 'P0002';
  end if;
  if v_request.channel <> 'fc_internal' or v_request.status <> 'sent_to_factory' then
    raise exception 'request is not waiting for factory shipment'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one shipment line is required' using errcode = '22023';
  end if;

  insert into public.shop_shipments (
    shipment_no, request_id, restaurant_id, status, shipped_at, created_by
  )
  values (
    public.shop_warehouse_next_shipment_no(),
    v_request.id,
    v_request.restaurant_id,
    'in_transit',
    v_occurred,
    auth.uid()
  )
  returning id into v_shipment_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    select * into v_order_line
    from public.shop_order_lines
    where id = (v_line ->> 'request_line_id')::uuid
      and request_id = p_request_id;
    if not found then
      raise exception 'shipment line does not belong to the request'
        using errcode = '22023';
    end if;
    v_qty := (v_line ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > v_order_line.quantity then
      raise exception 'shipped quantity must be > 0 and <= approved'
        using errcode = '22023';
    end if;

    v_assessment := public.assess_shop_warehouse_stock(
      v_order_line.warehouse, v_order_line.catalog_item_id, v_order_line.sku,
      v_order_line.unit, v_qty
    );
    v_warnings := v_warnings || jsonb_build_array(v_assessment ->> 'warning');

    insert into public.shop_shipment_lines (
      shipment_id, request_line_id, catalog_item_id, sku, name, unit, warehouse,
      approved_quantity, shipped_quantity, stock_warning
    )
    values (
      v_shipment_id, v_order_line.id, v_order_line.catalog_item_id, v_order_line.sku,
      v_order_line.name, v_order_line.unit, v_order_line.warehouse,
      v_order_line.quantity, v_qty, coalesce(v_assessment ->> 'warning', 'ok')
    )
    returning id into v_line_id;

    if v_order_line.warehouse = 'dry' then
      insert into public.shop_dry_stock_movements (
        catalog_item_id, sku, name, unit, movement_type, quantity,
        occurred_at, source_type, source_id, created_by, remarks
      )
      values (
        v_order_line.catalog_item_id, v_order_line.sku, v_order_line.name,
        v_order_line.unit, 'outbound', v_qty, v_occurred, 'shipment', v_line_id,
        auth.uid(), 'shop warehouse outbound'
      )
      returning id into v_dry_id;
      update public.shop_shipment_lines set dry_movement_id = v_dry_id where id = v_line_id;
    elsif v_order_line.warehouse = 'frozen' then
      select movement_id, meat_kind into v_meat_id, v_meat_kind
      from public.shop_write_frozen_movement(
        'outbound', v_order_line.sku, v_qty, v_order_line.unit, v_occurred,
        'shop-warehouse:shipment:' || v_line_id::text
      );
      update public.shop_shipment_lines
      set meat_movement_id = v_meat_id, meat_kind = v_meat_kind
      where id = v_line_id;
    end if;
  end loop;

  update public.shop_shipments
  set warning_flags = v_warnings
  where id = v_shipment_id;

  update public.shop_order_requests
  set status = 'in_transit'
  where id = p_request_id;

  insert into public.shop_order_events (request_id, event_type, payload, actor_id)
  values (
    p_request_id,
    'shipped',
    jsonb_build_object('shipmentId', v_shipment_id, 'warnings', v_warnings),
    auth.uid()
  );

  return jsonb_build_object(
    'id', v_shipment_id,
    'shipmentNo', (select shipment_no from public.shop_shipments where id = v_shipment_id),
    'warnings', v_warnings,
    'replayed', false
  );
end;
$$;

alter table public.shop_dry_stock_movements enable row level security;
alter table public.shop_warehouse_receipts enable row level security;
alter table public.shop_shipments enable row level security;
alter table public.shop_shipment_lines enable row level security;

drop policy if exists "Shop warehouse dry readers" on public.shop_dry_stock_movements;
create policy "Shop warehouse dry readers"
  on public.shop_dry_stock_movements for select to authenticated
  using (private.has_page_access('workspace.factory.warehouse'));

drop policy if exists "Shop warehouse receipt readers" on public.shop_warehouse_receipts;
create policy "Shop warehouse receipt readers"
  on public.shop_warehouse_receipts for select to authenticated
  using (private.has_page_access('workspace.factory.warehouse'));

drop policy if exists "Shop warehouse shipment readers" on public.shop_shipments;
create policy "Shop warehouse shipment readers"
  on public.shop_shipments for select to authenticated
  using (private.has_page_access('workspace.factory.warehouse'));

drop policy if exists "Shop warehouse shipment line readers" on public.shop_shipment_lines;
create policy "Shop warehouse shipment line readers"
  on public.shop_shipment_lines for select to authenticated
  using (private.has_page_access('workspace.factory.warehouse'));

drop policy if exists "Shop catalog warehouse readers" on public.shop_catalog_items;
create policy "Shop catalog warehouse readers"
  on public.shop_catalog_items for select to authenticated
  using (private.has_page_access('workspace.factory.warehouse'));

drop policy if exists "Shop request warehouse readers" on public.shop_order_requests;
create policy "Shop request warehouse readers"
  on public.shop_order_requests for select to authenticated
  using (
    private.has_page_access('workspace.factory.warehouse')
    and channel = 'fc_internal'
    and status in ('sent_to_factory', 'in_transit', 'shipped')
  );

drop policy if exists "Shop line warehouse readers" on public.shop_order_lines;
create policy "Shop line warehouse readers"
  on public.shop_order_lines for select to authenticated
  using (
    private.has_page_access('workspace.factory.warehouse')
    and exists (
      select 1
      from public.shop_order_requests as request
      where request.id = shop_order_lines.request_id
        and request.channel = 'fc_internal'
        and request.status in ('sent_to_factory', 'in_transit', 'shipped')
    )
  );

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values
  ('workspace.factory.warehouse', '貨倉存貨', '/factory/warehouse', 606, false, 'workspace.factory', 'subpage'),
  ('workspace.factory.warehouse.pending', '待出貨', '/factory/warehouse', 607, false, 'workspace.factory.warehouse', 'subpage'),
  ('workspace.factory.warehouse.outbound', '出貨紀錄', '/factory/warehouse/shipments', 608, false, 'workspace.factory.warehouse', 'subpage'),
  ('workspace.factory.warehouse.inbound', '入貨紀錄', '/factory/warehouse/receipts', 609, false, 'workspace.factory.warehouse', 'subpage')
on conflict (page_key) do update
set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

with roles(role) as (
  values ('Super Admin'), ('Admin'), ('Factory')
),
pages(page_key) as (
  values
    ('workspace.factory.warehouse'),
    ('workspace.factory.warehouse.pending'),
    ('workspace.factory.warehouse.outbound'),
    ('workspace.factory.warehouse.inbound')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, true, roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

grant select on public.shop_dry_stock_movements to authenticated;
grant select on public.shop_warehouse_receipts to authenticated;
grant select on public.shop_shipments to authenticated;
grant select on public.shop_shipment_lines to authenticated;
grant usage, select on sequence public.shop_warehouse_receipt_no_seq to authenticated;
grant usage, select on sequence public.shop_warehouse_shipment_no_seq to authenticated;

revoke all on function public.assess_shop_warehouse_stock(text, uuid, text, text, numeric) from public, anon;
grant execute on function public.assess_shop_warehouse_stock(text, uuid, text, text, numeric) to authenticated;
revoke all on function public.assess_shop_warehouse_request(uuid, jsonb) from public, anon;
grant execute on function public.assess_shop_warehouse_request(uuid, jsonb) to authenticated;
revoke all on function public.record_shop_warehouse_receipt(uuid, numeric, date, uuid, text, text, text) from public, anon;
grant execute on function public.record_shop_warehouse_receipt(uuid, numeric, date, uuid, text, text, text) to authenticated;
revoke all on function public.ship_shop_order_request(uuid, jsonb) from public, anon;
grant execute on function public.ship_shop_order_request(uuid, jsonb) to authenticated;
revoke all on function public.shop_write_frozen_movement(text, text, numeric, text, timestamptz, text) from public, anon;
