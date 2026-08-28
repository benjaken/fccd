-- Customer self-service add-on catalogue, blackout dates, and PayPal checkout
-- state. Anonymous callers never receive direct table access; all customer
-- operations remain behind the existing short-lived self-service session.

create table public.self_service_addon_products (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id),
  product_id uuid not null references public.products(id),
  price_override numeric(14,2) check (price_override is null or price_override >= 0),
  min_quantity integer not null default 1 check (min_quantity > 0),
  max_quantity integer not null default 20 check (max_quantity >= min_quantity),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index self_service_addon_products_active_pair_idx
  on public.self_service_addon_products(channel_id, product_id)
  where archived_at is null;
create index self_service_addon_products_channel_sort_idx
  on public.self_service_addon_products(channel_id, is_active, sort_order)
  where archived_at is null;

create table public.self_service_addon_block_dates (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index self_service_addon_block_dates_active_date_idx
  on public.self_service_addon_block_dates(block_date)
  where archived_at is null;

create table public.customer_self_service_addon_checkouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  status text not null default 'pending'
    check (status in ('pending', 'paypal_created', 'capture_pending', 'completed', 'cancelled', 'expired', 'failed', 'reversed')),
  cart_snapshot jsonb not null,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'HKD',
  cutoff_at timestamptz not null,
  request_id uuid not null default gen_random_uuid() unique,
  paypal_order_id text unique,
  paypal_capture_id text unique,
  payment_id uuid references public.payments(id),
  failure_code text,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customer_self_service_addon_checkouts_order_idx
  on public.customer_self_service_addon_checkouts(order_id, created_at desc);
create index customer_self_service_addon_checkouts_pending_idx
  on public.customer_self_service_addon_checkouts(expires_at)
  where status in ('pending', 'paypal_created', 'capture_pending');

create table public.paypal_webhook_events (
  event_id text primary key,
  event_type text not null,
  paypal_order_id text,
  paypal_capture_id text,
  payload jsonb not null,
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.order_lines
  add column if not exists addon_checkout_id uuid
    references public.customer_self_service_addon_checkouts(id);

create index if not exists order_lines_active_addon_order_idx
  on public.order_lines(order_id)
  where is_addon and not is_void;

alter table public.self_service_addon_products enable row level security;
alter table public.self_service_addon_block_dates enable row level security;
alter table public.customer_self_service_addon_checkouts enable row level security;
alter table public.paypal_webhook_events enable row level security;

revoke all on table
  public.self_service_addon_products,
  public.self_service_addon_block_dates,
  public.customer_self_service_addon_checkouts,
  public.paypal_webhook_events
from public, anon, authenticated;

grant select, insert, update on public.self_service_addon_products to authenticated;
grant select, insert, update on public.self_service_addon_block_dates to authenticated;
grant all on table
  public.self_service_addon_products,
  public.self_service_addon_block_dates,
  public.customer_self_service_addon_checkouts,
  public.paypal_webhook_events
to service_role;

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values
  ('orders.settings.addons', '加單設定', '/orders/settings/add-ons', 36, false, 'orders.settings', 'subpage'),
  ('orders.settings.addon_block_dates', '加單 Block Date', '/orders/settings/add-on-block-dates', 37, false, 'orders.settings', 'subpage')
on conflict (page_key) do update
set display_name = excluded.display_name,
    route = excluded.route,
    sort_order = excluded.sort_order,
    is_high_risk = excluded.is_high_risk,
    parent_page_key = excluded.parent_page_key,
    page_kind = excluded.page_kind,
    updated_at = now();

with roles(role) as (
  values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'),
         ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
), pages(page_key) as (
  values ('orders.settings.addons'), ('orders.settings.addon_block_dates')
)
insert into public.role_page_permissions(role, page_key, can_access, can_manage)
select roles.role, pages.page_key,
       roles.role in ('Super Admin', 'Admin'),
       roles.role in ('Super Admin', 'Admin')
from roles cross join pages
on conflict (role, page_key) do update
set can_access = excluded.can_access,
    can_manage = excluded.can_manage,
    updated_at = now();

create policy "Add-on settings readers"
on public.self_service_addon_products for select to authenticated
using (private.has_page_access('orders.settings.addons'));
create policy "Add-on settings managers insert"
on public.self_service_addon_products for insert to authenticated
with check (private.has_page_manage('orders.settings.addons'));
create policy "Add-on settings managers update"
on public.self_service_addon_products for update to authenticated
using (private.has_page_manage('orders.settings.addons'))
with check (private.has_page_manage('orders.settings.addons'));

create policy "Add-on block date readers"
on public.self_service_addon_block_dates for select to authenticated
using (private.has_page_access('orders.settings.addon_block_dates'));
create policy "Add-on block date managers insert"
on public.self_service_addon_block_dates for insert to authenticated
with check (private.has_page_manage('orders.settings.addon_block_dates'));
create policy "Add-on block date managers update"
on public.self_service_addon_block_dates for update to authenticated
using (private.has_page_manage('orders.settings.addon_block_dates'))
with check (private.has_page_manage('orders.settings.addon_block_dates'));

create or replace function private.self_service_addon_cutoff(p_delivery_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select case when p_delivery_at is null then null else
    (((p_delivery_at at time zone 'Asia/Hong_Kong')::date - 1) + time '15:00')
      at time zone 'Asia/Hong_Kong'
  end
$$;

create or replace function private.self_service_addon_unavailable_reason(p_order public.orders)
returns text
language plpgsql
stable
set search_path = public, private
as $$
declare
  v_delivery_date date;
  v_cutoff timestamptz;
begin
  if p_order.id is null or p_order.document_type <> 'order' or p_order.archived_at is not null then
    return 'order_unavailable';
  end if;
  if p_order.delivery_at is null then return 'delivery_date_missing'; end if;
  if coalesce(p_order.delivery_status, '') in ('已取消', '己取消', '取消', '已送達', '己送達') then
    return 'order_closed';
  end if;
  v_delivery_date := (p_order.delivery_at at time zone 'Asia/Hong_Kong')::date;
  if exists (
    select 1 from public.self_service_addon_block_dates block
    where block.block_date = v_delivery_date and block.archived_at is null
  ) then
    return 'block_date';
  end if;
  v_cutoff := private.self_service_addon_cutoff(p_order.delivery_at);
  if now() >= v_cutoff then return 'cutoff_passed'; end if;
  if not exists (
    select 1
    from public.self_service_addon_products setting
    join public.products product on product.id = setting.product_id
    where setting.channel_id = p_order.channel_id
      and setting.is_active and setting.archived_at is null
      and product.is_active and product.archived_at is null
      and coalesce(setting.price_override, product.price) > 0
  ) then
    return 'no_products';
  end if;
  return null;
end;
$$;

create or replace function public.customer_self_service_addon_options(
  p_session_token uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session private.customer_self_service_sessions%rowtype;
  v_order public.orders%rowtype;
  v_reason text;
begin
  select * into v_session from private.customer_self_service_sessions session
  where session.token = p_session_token and session.expires_at > now();
  if v_session.token is null then
    raise exception 'self_service_session_expired' using errcode = '28000';
  end if;

  select * into v_order from public.orders orders
  where orders.id = p_order_id
    and orders.document_type = 'order'
    and orders.archived_at is null
    and private.self_service_order_matches(orders, v_session.phone_hash, v_session.email_hash);
  if v_order.id is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;

  v_reason := private.self_service_addon_unavailable_reason(v_order);
  return jsonb_build_object(
    'canAddOn', v_reason is null,
    'reason', v_reason,
    'cutoffAt', private.self_service_addon_cutoff(v_order.delivery_at),
    'hasAddOn', exists (
      select 1 from public.order_lines line
      where line.order_id = v_order.id and line.is_addon and not line.is_void
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', setting.id,
        'productId', product.id,
        'sku', product.sku,
        'name', coalesce(nullif(btrim(product.chinese_name), ''), product.name),
        'price', coalesce(setting.price_override, product.price),
        'minQuantity', setting.min_quantity,
        'maxQuantity', setting.max_quantity
      ) order by setting.sort_order, product.sku, product.name)
      from public.self_service_addon_products setting
      join public.products product on product.id = setting.product_id
      where setting.channel_id = v_order.channel_id
        and setting.is_active and setting.archived_at is null
        and product.is_active and product.archived_at is null
        and coalesce(setting.price_override, product.price) > 0
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.customer_self_service_prepare_addon_checkout(
  p_session_token uuid,
  p_order_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session private.customer_self_service_sessions%rowtype;
  v_order public.orders%rowtype;
  v_reason text;
  v_cart jsonb;
  v_amount numeric(14,2);
  v_checkout_id uuid;
  v_request_id uuid;
  v_cutoff timestamptz;
begin
  select * into v_session from private.customer_self_service_sessions session
  where session.token = p_session_token and session.expires_at > now();
  if v_session.token is null then raise exception 'self_service_session_expired' using errcode = '28000'; end if;

  select * into v_order from public.orders orders
  where orders.id = p_order_id
    and orders.document_type = 'order'
    and orders.archived_at is null
    and private.self_service_order_matches(orders, v_session.phone_hash, v_session.email_hash)
  for update;
  if v_order.id is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;

  v_reason := private.self_service_addon_unavailable_reason(v_order);
  if v_reason is not null then raise exception '%', v_reason using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid_addon_cart' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)) <>
     (select count(distinct item.product_id) from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)) then
    raise exception 'duplicate_addon_product' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    left join public.self_service_addon_products setting
      on setting.product_id = item.product_id
     and setting.channel_id = v_order.channel_id
     and setting.is_active and setting.archived_at is null
    left join public.products product
      on product.id = setting.product_id and product.is_active and product.archived_at is null
    where setting.id is null or product.id is null or item.quantity is null
      or item.quantity < setting.min_quantity or item.quantity > setting.max_quantity
      or coalesce(setting.price_override, product.price) <= 0
  ) then
    raise exception 'invalid_addon_item' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object(
           'product_id', product.id, 'sku', product.sku,
           'name', coalesce(nullif(btrim(product.chinese_name), ''), product.name),
           'quantity', item.quantity,
           'unit_price', coalesce(setting.price_override, product.price),
           'total_price', round(item.quantity * coalesce(setting.price_override, product.price), 2)
         ) order by setting.sort_order, product.sku),
         round(sum(item.quantity * coalesce(setting.price_override, product.price)), 2)
    into v_cart, v_amount
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
  join public.self_service_addon_products setting
    on setting.product_id = item.product_id and setting.channel_id = v_order.channel_id
   and setting.is_active and setting.archived_at is null
  join public.products product on product.id = setting.product_id
   and product.is_active and product.archived_at is null;

  v_cutoff := private.self_service_addon_cutoff(v_order.delivery_at);
  insert into public.customer_self_service_addon_checkouts(
    order_id, cart_snapshot, amount, currency, cutoff_at, expires_at
  ) values (
    v_order.id, v_cart, v_amount, v_order.currency,
    v_cutoff, least(v_cutoff, now() + interval '30 minutes')
  ) returning id, request_id into v_checkout_id, v_request_id;

  return jsonb_build_object(
    'checkoutId', v_checkout_id,
    'requestId', v_request_id,
    'amount', v_amount,
    'currency', v_order.currency,
    'orderNumber', v_order.order_number,
    'cutoffAt', v_cutoff
  );
end;
$$;

create or replace function public.customer_self_service_paypal_checkout(
  p_session_token uuid,
  p_checkout_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session private.customer_self_service_sessions%rowtype;
  v_checkout public.customer_self_service_addon_checkouts%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_session from private.customer_self_service_sessions session
  where session.token = p_session_token and session.expires_at > now();
  if v_session.token is null then raise exception 'self_service_session_expired' using errcode = '28000'; end if;
  select * into v_checkout from public.customer_self_service_addon_checkouts checkout
  where checkout.id = p_checkout_id;
  select * into v_order from public.orders orders
  where orders.id = v_checkout.order_id
    and private.self_service_order_matches(orders, v_session.phone_hash, v_session.email_hash);
  if v_checkout.id is null or v_order.id is null then raise exception 'checkout_not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'checkoutId', v_checkout.id, 'orderId', v_order.id, 'orderNumber', v_order.order_number,
    'status', v_checkout.status, 'amount', v_checkout.amount, 'currency', v_checkout.currency,
    'requestId', v_checkout.request_id, 'paypalOrderId', v_checkout.paypal_order_id,
    'expiresAt', v_checkout.expires_at, 'cutoffAt', v_checkout.cutoff_at
  );
end;
$$;

create or replace function public.attach_customer_self_service_paypal_order(
  p_checkout_id uuid,
  p_paypal_order_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.customer_self_service_addon_checkouts
  set paypal_order_id = nullif(btrim(p_paypal_order_id), ''),
      status = 'paypal_created', updated_at = now()
  where id = p_checkout_id and status = 'pending' and expires_at > now();
  if not found then raise exception 'checkout_not_payable' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.begin_customer_self_service_addon_capture(
  p_session_token uuid,
  p_checkout_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session private.customer_self_service_sessions%rowtype;
  v_checkout public.customer_self_service_addon_checkouts%rowtype;
  v_order public.orders%rowtype;
  v_reason text;
begin
  select * into v_session from private.customer_self_service_sessions session
  where session.token = p_session_token and session.expires_at > now();
  if v_session.token is null then raise exception 'self_service_session_expired' using errcode = '28000'; end if;

  select * into v_checkout from public.customer_self_service_addon_checkouts checkout
  where checkout.id = p_checkout_id for update;
  select * into v_order from public.orders orders
  where orders.id = v_checkout.order_id
    and private.self_service_order_matches(orders, v_session.phone_hash, v_session.email_hash)
  for update;
  if v_checkout.id is null or v_order.id is null then raise exception 'checkout_not_found' using errcode = 'P0002'; end if;
  if v_checkout.status = 'completed' then
    return jsonb_build_object('completed', true, 'checkoutId', v_checkout.id, 'orderId', v_order.id);
  end if;
  if v_checkout.status not in ('paypal_created', 'capture_pending') or v_checkout.expires_at <= now() then
    raise exception 'checkout_not_payable' using errcode = 'P0001';
  end if;
  if v_checkout.status = 'paypal_created' then
    v_reason := private.self_service_addon_unavailable_reason(v_order);
    if v_reason is not null then raise exception '%', v_reason using errcode = 'P0001'; end if;
    update public.customer_self_service_addon_checkouts
    set status = 'capture_pending', updated_at = now()
    where id = v_checkout.id;
  end if;
  return jsonb_build_object(
    'completed', false, 'checkoutId', v_checkout.id, 'orderId', v_order.id,
    'orderNumber', v_order.order_number, 'status', 'capture_pending',
    'amount', v_checkout.amount, 'currency', v_checkout.currency,
    'requestId', v_checkout.request_id, 'paypalOrderId', v_checkout.paypal_order_id,
    'expiresAt', v_checkout.expires_at, 'cutoffAt', v_checkout.cutoff_at
  );
end;
$$;

create or replace function public.complete_customer_self_service_addon_checkout(
  p_checkout_id uuid,
  p_paypal_order_id text,
  p_paypal_capture_id text,
  p_amount numeric,
  p_currency text,
  p_captured_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_checkout public.customer_self_service_addon_checkouts%rowtype;
  v_order public.orders%rowtype;
  v_payment_method_id uuid;
  v_payment_id uuid;
  v_item_order numeric;
begin
  select * into v_checkout from public.customer_self_service_addon_checkouts checkout
  where checkout.id = p_checkout_id for update;
  if v_checkout.id is null or v_checkout.paypal_order_id is distinct from p_paypal_order_id then
    raise exception 'checkout_not_found' using errcode = 'P0002';
  end if;
  if v_checkout.status = 'completed' then
    if v_checkout.paypal_capture_id is distinct from p_paypal_capture_id then
      raise exception 'capture_conflict' using errcode = '23505';
    end if;
    return v_checkout.payment_id;
  end if;
  if v_checkout.status <> 'capture_pending' then raise exception 'checkout_not_payable' using errcode = 'P0001'; end if;
  if round(p_amount, 2) <> v_checkout.amount or upper(p_currency) <> v_checkout.currency then
    raise exception 'paypal_amount_mismatch' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = v_checkout.order_id for update;
  if p_captured_at >= v_checkout.cutoff_at then
    raise exception 'addon_checkout_closed' using errcode = 'P0001';
  end if;

  select coalesce(max(item_order), 0) into v_item_order
  from public.order_lines where order_id = v_order.id;

  insert into public.order_lines(
    id, legacy_id, order_id, product_id, sku_snapshot, product_name_snapshot,
    content_snapshot, quantity, unit_price, total_price, item_order,
    delivery_at, is_addon, addon_checkout_id
  )
  select gen_random_uuid(), 'self-service-addon-' || gen_random_uuid(), v_order.id,
         item.product_id, item.sku, item.name, item.name,
         item.quantity, item.unit_price, item.total_price,
         v_item_order + row_number() over (), v_order.delivery_at, true, v_checkout.id
  from jsonb_to_recordset(v_checkout.cart_snapshot) as item(
    product_id uuid, sku text, name text, quantity numeric,
    unit_price numeric, total_price numeric
  );

  select id into v_payment_method_id from public.payment_methods
  where lower(name) = 'paypal' and archived_at is null
  order by is_active desc, created_at limit 1;
  if v_payment_method_id is null then
    insert into public.payment_methods(legacy_id, name, paypal_reference, is_active)
    values ('web-paypal', 'PayPal', 'true', true)
    on conflict (legacy_id) do update set is_active = true, archived_at = null
    returning id into v_payment_method_id;
  end if;

  v_payment_id := gen_random_uuid();
  insert into public.payments(
    id, legacy_id, order_id, channel_id, payment_method_id,
    order_number_snapshot, currency, amount, payment_at, paypal_reference
  ) values (
    v_payment_id, 'self-service-paypal-' || v_payment_id, v_order.id,
    v_order.channel_id, v_payment_method_id, v_order.order_number,
    v_checkout.currency, v_checkout.amount, p_captured_at, p_paypal_capture_id
  );

  perform private.recalculate_quote_total(v_order.id);
  update public.customer_self_service_addon_checkouts
  set status = 'completed', paypal_capture_id = p_paypal_capture_id,
      payment_id = v_payment_id, completed_at = p_captured_at, updated_at = now()
  where id = v_checkout.id;
  return v_payment_id;
end;
$$;

create or replace function public.reverse_customer_self_service_addon_checkout(
  p_paypal_capture_id text
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_checkout public.customer_self_service_addon_checkouts%rowtype;
begin
  select * into v_checkout
  from public.customer_self_service_addon_checkouts checkout
  where checkout.paypal_capture_id = p_paypal_capture_id
  for update;
  if v_checkout.id is null or v_checkout.status = 'reversed' then return; end if;
  update public.payments set voided_at = coalesce(voided_at, now()), updated_at = now()
  where id = v_checkout.payment_id;
  update public.customer_self_service_addon_checkouts
  set status = 'reversed', updated_at = now()
  where id = v_checkout.id;
  perform private.recalculate_quote_total(v_checkout.order_id);
end;
$$;

revoke all on function public.customer_self_service_addon_options(uuid, uuid) from public;
revoke all on function public.customer_self_service_prepare_addon_checkout(uuid, uuid, jsonb) from public;
revoke all on function public.customer_self_service_paypal_checkout(uuid, uuid) from public;
revoke all on function public.attach_customer_self_service_paypal_order(uuid, text) from public, anon, authenticated;
revoke all on function public.begin_customer_self_service_addon_capture(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_customer_self_service_addon_checkout(uuid, text, text, numeric, text, timestamptz) from public, anon, authenticated;
revoke all on function public.reverse_customer_self_service_addon_checkout(text) from public, anon, authenticated;

grant execute on function public.customer_self_service_addon_options(uuid, uuid) to anon, authenticated;
grant execute on function public.customer_self_service_prepare_addon_checkout(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.customer_self_service_prepare_addon_checkout(uuid, uuid, jsonb) to service_role;
grant execute on function public.customer_self_service_paypal_checkout(uuid, uuid) to service_role;
grant execute on function public.attach_customer_self_service_paypal_order(uuid, text) to service_role;
grant execute on function public.begin_customer_self_service_addon_capture(uuid, uuid) to service_role;
grant execute on function public.complete_customer_self_service_addon_checkout(uuid, text, text, numeric, text, timestamptz) to service_role;
grant execute on function public.reverse_customer_self_service_addon_checkout(text) to service_role;
