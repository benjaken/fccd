-- Shop receive for FC-internal shipments. Variance becomes an exception.
-- One receive per shipment. Retry does not create a second receive.

create sequence if not exists public.shop_receive_no_seq;

create table if not exists public.shop_receives (
  id uuid primary key default gen_random_uuid(),
  receive_no text not null unique,
  shipment_id uuid not null unique references public.shop_shipments (id),
  request_id uuid not null references public.shop_order_requests (id),
  restaurant_id uuid not null references public.restaurants (id),
  status text not null check (status in ('received', 'exception')),
  note text,
  received_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  idempotency_key text unique
);

create table if not exists public.shop_receive_lines (
  id uuid primary key default gen_random_uuid(),
  receive_id uuid not null references public.shop_receives (id) on delete cascade,
  shipment_line_id uuid not null unique references public.shop_shipment_lines (id),
  name text not null,
  unit text not null,
  shipped_quantity numeric not null,
  received_quantity numeric not null check (received_quantity >= 0),
  variance numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_receive_exceptions (
  id uuid primary key default gen_random_uuid(),
  receive_id uuid not null references public.shop_receives (id) on delete cascade,
  receive_line_id uuid not null references public.shop_receive_lines (id) on delete cascade,
  shipment_line_id uuid not null references public.shop_shipment_lines (id),
  expected_quantity numeric not null,
  received_quantity numeric not null,
  variance numeric not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create or replace function public.shop_receive_next_no()
returns text
language sql
as $$
  select 'RC-' || to_char(timezone('Asia/Hong_Kong', now()), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.shop_receive_no_seq')::text, 4, '0');
$$;

create or replace function public.receive_shop_shipment(
  p_shipment_id uuid,
  p_lines jsonb,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment public.shop_shipments%rowtype;
  v_existing public.shop_receives%rowtype;
  v_receive_id uuid;
  v_line jsonb;
  v_ship_line public.shop_shipment_lines%rowtype;
  v_qty numeric;
  v_variance numeric;
  v_has_exception boolean := false;
  v_line_id uuid;
  v_reason text;
  v_status text;
begin
  if not (
    private.has_page_access('workspace.restaurant.receive')
    or private.has_page_access('workspace.restaurant')
  ) then
    raise exception 'not authorized to receive shop shipments'
      using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.shop_receives
    where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'id', v_existing.id,
        'receiveNo', v_existing.receive_no,
        'status', v_existing.status,
        'replayed', true
      );
    end if;
  end if;

  select * into v_existing from public.shop_receives where shipment_id = p_shipment_id;
  if found then
    return jsonb_build_object(
      'id', v_existing.id,
      'receiveNo', v_existing.receive_no,
      'status', v_existing.status,
      'replayed', true
    );
  end if;

  select * into v_shipment from public.shop_shipments where id = p_shipment_id;
  if not found then
    raise exception 'shipment not found' using errcode = 'P0002';
  end if;
  if v_shipment.status <> 'in_transit' then
    raise exception 'shipment is not waiting for shop receive'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one receive line is required' using errcode = '22023';
  end if;

  insert into public.shop_receives (
    receive_no, shipment_id, request_id, restaurant_id, status, note,
    created_by, idempotency_key
  )
  values (
    public.shop_receive_next_no(),
    v_shipment.id,
    v_shipment.request_id,
    v_shipment.restaurant_id,
    'received',
    nullif(btrim(coalesce(p_note, '')), ''),
    auth.uid(),
    p_idempotency_key
  )
  returning id into v_receive_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    select * into v_ship_line
    from public.shop_shipment_lines
    where id = (v_line ->> 'shipment_line_id')::uuid
      and shipment_id = p_shipment_id;
    if not found then
      raise exception 'receive line does not belong to the shipment'
        using errcode = '22023';
    end if;
    v_qty := (v_line ->> 'received_quantity')::numeric;
    if v_qty is null or v_qty < 0 then
      raise exception 'received quantity cannot be negative' using errcode = '22023';
    end if;
    v_variance := v_qty - v_ship_line.shipped_quantity;
    if v_variance <> 0 then
      v_has_exception := true;
    end if;

    insert into public.shop_receive_lines (
      receive_id, shipment_line_id, name, unit,
      shipped_quantity, received_quantity, variance
    )
    values (
      v_receive_id, v_ship_line.id, v_ship_line.name, v_ship_line.unit,
      v_ship_line.shipped_quantity, v_qty, v_variance
    )
    returning id into v_line_id;

    if v_variance <> 0 then
      v_reason := nullif(btrim(coalesce(v_line ->> 'reason', '')), '');
      insert into public.shop_receive_exceptions (
        receive_id, receive_line_id, shipment_line_id,
        expected_quantity, received_quantity, variance, reason
      )
      values (
        v_receive_id, v_line_id, v_ship_line.id,
        v_ship_line.shipped_quantity, v_qty, v_variance,
        coalesce(v_reason, '數量不符')
      );
    end if;
  end loop;

  v_status := case when v_has_exception then 'exception' else 'received' end;

  update public.shop_receives
  set status = v_status
  where id = v_receive_id;

  update public.shop_shipments
  set status = 'received'
  where id = p_shipment_id;

  update public.shop_order_requests
  set status = v_status
  where id = v_shipment.request_id;

  insert into public.shop_order_events (request_id, event_type, payload, actor_id)
  values (
    v_shipment.request_id,
    case when v_has_exception then 'receive_exception' else 'received' end,
    jsonb_build_object('receiveId', v_receive_id, 'status', v_status),
    auth.uid()
  );

  return jsonb_build_object(
    'id', v_receive_id,
    'receiveNo', (select receive_no from public.shop_receives where id = v_receive_id),
    'status', v_status,
    'replayed', false
  );
end;
$$;

alter table public.shop_receives enable row level security;
alter table public.shop_receive_lines enable row level security;
alter table public.shop_receive_exceptions enable row level security;

drop policy if exists "Shop receive readers" on public.shop_receives;
create policy "Shop receive readers"
  on public.shop_receives for select to authenticated
  using (
    private.has_page_access('workspace.restaurant')
    or private.has_page_access('restaurant.ordering')
    or private.has_page_access('workspace.factory.warehouse')
  );

drop policy if exists "Shop receive line readers" on public.shop_receive_lines;
create policy "Shop receive line readers"
  on public.shop_receive_lines for select to authenticated
  using (
    private.has_page_access('workspace.restaurant')
    or private.has_page_access('restaurant.ordering')
    or private.has_page_access('workspace.factory.warehouse')
  );

drop policy if exists "Shop receive exception readers" on public.shop_receive_exceptions;
create policy "Shop receive exception readers"
  on public.shop_receive_exceptions for select to authenticated
  using (
    private.has_page_access('workspace.restaurant')
    or private.has_page_access('restaurant.ordering')
    or private.has_page_access('workspace.factory.warehouse')
  );

drop policy if exists "Shop shipment restaurant readers" on public.shop_shipments;
create policy "Shop shipment restaurant readers"
  on public.shop_shipments for select to authenticated
  using (
    private.has_page_access('workspace.restaurant')
    or private.has_page_access('restaurant.ordering')
  );

drop policy if exists "Shop shipment line restaurant readers" on public.shop_shipment_lines;
create policy "Shop shipment line restaurant readers"
  on public.shop_shipment_lines for select to authenticated
  using (
    private.has_page_access('workspace.restaurant')
    or private.has_page_access('restaurant.ordering')
  );

drop policy if exists "Shop request warehouse readers" on public.shop_order_requests;
create policy "Shop request warehouse readers"
  on public.shop_order_requests for select to authenticated
  using (
    private.has_page_access('workspace.factory.warehouse')
    and channel = 'fc_internal'
    and status in ('sent_to_factory', 'in_transit', 'shipped', 'received', 'exception')
  );

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values
  ('workspace.restaurant.receive', '確認收貨', '/restaurant-workspace/receive', 12, false, 'workspace.restaurant', 'subpage')
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
  values ('Super Admin'), ('Admin'), ('Accounting'), ('Shop manager')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, 'workspace.restaurant.receive', true, roles.role = 'Super Admin'
from roles
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

grant select on public.shop_receives to authenticated;
grant select on public.shop_receive_lines to authenticated;
grant select on public.shop_receive_exceptions to authenticated;
grant usage, select on sequence public.shop_receive_no_seq to authenticated;

revoke all on function public.receive_shop_shipment(uuid, jsonb, text, text) from public, anon;
grant execute on function public.receive_shop_shipment(uuid, jsonb, text, text) to authenticated;
