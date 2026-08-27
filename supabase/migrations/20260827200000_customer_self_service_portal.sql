-- Public customer self-service lookup. A customer must prove possession of
-- both the order phone number and email address before receiving a short-lived
-- random session token. All data access remains inside SECURITY DEFINER RPCs.

create extension if not exists pgcrypto;

create table if not exists private.customer_self_service_sessions (
  token uuid primary key default gen_random_uuid(),
  phone_hash bytea not null,
  email_hash bytea not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);

create index if not exists customer_self_service_sessions_expiry_idx
  on private.customer_self_service_sessions(expires_at);

create index if not exists customer_self_service_sessions_identity_idx
  on private.customer_self_service_sessions(phone_hash, email_hash, created_at desc);

revoke all on private.customer_self_service_sessions from public, anon, authenticated;

create or replace function private.self_service_phone(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when length(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g')) = 8
      then '852' || regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g')
    when regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g') like '00%'
      then substr(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), 3)
    else regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g')
  end
$$;

create index if not exists orders_self_service_email_idx
  on public.orders(lower(btrim(email_snapshot)))
  where document_type = 'order' and archived_at is null;

create index if not exists orders_self_service_phone_a_idx
  on public.orders(private.self_service_phone(contact_number_a_snapshot))
  where document_type = 'order' and archived_at is null;

create index if not exists orders_self_service_phone_b_idx
  on public.orders(private.self_service_phone(contact_number_b_snapshot))
  where document_type = 'order' and archived_at is null;

create or replace function private.self_service_mask_email(p_email text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when position('@' in coalesce(p_email, '')) <= 1 then '*****'
    else left(split_part(p_email, '@', 1), 1)
      || repeat('*', greatest(length(split_part(p_email, '@', 1)) - 1, 3))
      || '@' || split_part(p_email, '@', 2)
  end
$$;

create or replace function private.self_service_mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when length(private.self_service_phone(p_phone)) < 4 then '*****'
    else '****' || right(private.self_service_phone(p_phone), 4)
  end
$$;

create or replace function private.self_service_order_matches(
  p_order public.orders,
  p_phone_hash bytea,
  p_email_hash bytea
)
returns boolean
language sql
stable
set search_path = public, private
as $$
  select extensions.digest(lower(btrim(coalesce(p_order.email_snapshot, ''))), 'sha256') = p_email_hash
    and (
      extensions.digest(private.self_service_phone(p_order.contact_number_a_snapshot), 'sha256') = p_phone_hash
      or extensions.digest(private.self_service_phone(p_order.contact_number_b_snapshot), 'sha256') = p_phone_hash
    )
$$;

create or replace function public.customer_self_service_login(p_phone text, p_email text)
returns table(
  session_token uuid,
  session_expires_at timestamptz,
  masked_phone text,
  masked_email text,
  order_id uuid,
  order_number text,
  order_date timestamptz,
  delivery_date timestamptz,
  grand_total numeric,
  currency text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_phone text := private.self_service_phone(p_phone);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone_hash bytea;
  v_email_hash bytea;
  v_token uuid;
  v_expires timestamptz;
begin
  if v_phone !~ '^[0-9]{8,15}$'
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then
    raise exception 'invalid_lookup_details' using errcode = '22023';
  end if;

  v_phone_hash := extensions.digest(v_phone, 'sha256');
  v_email_hash := extensions.digest(v_email, 'sha256');

  delete from private.customer_self_service_sessions where expires_at <= now();

  if (
    select count(*) >= 5
    from private.customer_self_service_sessions session
    where session.phone_hash = v_phone_hash
      and session.email_hash = v_email_hash
      and session.created_at > now() - interval '15 minutes'
  ) then
    raise exception 'lookup_rate_limited' using errcode = 'P0001';
  end if;

  insert into private.customer_self_service_sessions(phone_hash, email_hash)
  values (v_phone_hash, v_email_hash)
  returning token, expires_at into v_token, v_expires;

  if not exists (
    select 1
    from public.orders orders
    where orders.document_type = 'order'
      and orders.archived_at is null
      and lower(btrim(coalesce(orders.email_snapshot, ''))) = v_email
      and (
        private.self_service_phone(orders.contact_number_a_snapshot) = v_phone
        or private.self_service_phone(orders.contact_number_b_snapshot) = v_phone
      )
  ) then
    return;
  end if;

  return query
  select
    v_token,
    v_expires,
    private.self_service_mask_phone(v_phone),
    private.self_service_mask_email(v_email),
    orders.id,
    orders.order_number,
    coalesce(orders.bubble_created_at, orders.created_at),
    orders.delivery_at,
    orders.grand_total,
    orders.currency::text
  from public.orders orders
  where orders.document_type = 'order'
    and orders.archived_at is null
    and lower(btrim(coalesce(orders.email_snapshot, ''))) = v_email
    and (
      private.self_service_phone(orders.contact_number_a_snapshot) = v_phone
      or private.self_service_phone(orders.contact_number_b_snapshot) = v_phone
    )
  order by coalesce(orders.delivery_at, orders.created_at) desc, orders.order_number desc;
end;
$$;

create or replace function public.customer_self_service_orders(p_session_token uuid)
returns table(
  session_expires_at timestamptz,
  masked_phone text,
  masked_email text,
  order_id uuid,
  order_number text,
  order_date timestamptz,
  delivery_date timestamptz,
  grand_total numeric,
  currency text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    session.expires_at,
    private.self_service_mask_phone(case
      when extensions.digest(private.self_service_phone(orders.contact_number_a_snapshot), 'sha256') = session.phone_hash
        then orders.contact_number_a_snapshot
      else orders.contact_number_b_snapshot
    end),
    private.self_service_mask_email(orders.email_snapshot),
    orders.id,
    orders.order_number,
    coalesce(orders.bubble_created_at, orders.created_at),
    orders.delivery_at,
    orders.grand_total,
    orders.currency::text
  from private.customer_self_service_sessions session
  join public.orders orders
    on private.self_service_order_matches(orders, session.phone_hash, session.email_hash)
  where session.token = p_session_token
    and session.expires_at > now()
    and orders.document_type = 'order'
    and orders.archived_at is null
  order by coalesce(orders.delivery_at, orders.created_at) desc, orders.order_number desc
$$;

create or replace function public.customer_self_service_order_detail(
  p_session_token uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_order public.orders%rowtype;
  v_session private.customer_self_service_sessions%rowtype;
begin
  select * into v_session
  from private.customer_self_service_sessions session
  where session.token = p_session_token and session.expires_at > now();

  if v_session.token is null then
    raise exception 'self_service_session_expired' using errcode = '28000';
  end if;

  select * into v_order
  from public.orders orders
  where orders.id = p_order_id
    and orders.document_type = 'order'
    and orders.archived_at is null
    and private.self_service_order_matches(orders, v_session.phone_hash, v_session.email_hash);

  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'orderNumber', v_order.order_number,
    'orderDate', coalesce(v_order.bubble_created_at, v_order.created_at),
    'deliveryDate', v_order.delivery_at,
    'deliveryTime', v_order.delivery_time,
    'customerName', v_order.customer_name_snapshot,
    'companyName', v_order.company_name_snapshot,
    'phoneA', v_order.contact_number_a_snapshot,
    'phoneB', v_order.contact_number_b_snapshot,
    'email', v_order.email_snapshot,
    'maskedPhoneA', private.self_service_mask_phone(v_order.contact_number_a_snapshot),
    'maskedPhoneB', case
      when nullif(btrim(v_order.contact_number_b_snapshot), '') is null then null
      else private.self_service_mask_phone(v_order.contact_number_b_snapshot)
    end,
    'maskedEmail', private.self_service_mask_email(v_order.email_snapshot),
    'address', v_order.shipping_address_snapshot,
    'shippingMethod', (
      select coalesce(method.display_name, method.name)
      from public.shipping_methods method where method.id = v_order.shipping_method_id
    ),
    'deliveryStatus', v_order.delivery_status,
    'factoryArranged', coalesce(v_order.is_sent_to_factory, false),
    'fleetArranged', exists (
      select 1 from public.deliveries delivery
      where delivery.order_id = v_order.id and delivery.motorcade_id is not null
    ),
    'currency', v_order.currency,
    'grandTotal', coalesce(v_order.grand_total, 0),
    'outstanding', coalesce(v_order.outstanding, 0),
    'paid', coalesce(v_order.outstanding, 0) <= 0 and coalesce(v_order.grand_total, 0) > 0,
    'channelName', (select channel.name from public.channels channel where channel.id = v_order.channel_id),
    'channelEmail', (select channel.email from public.channels channel where channel.id = v_order.channel_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', line.id,
        'name', coalesce(nullif(btrim(line.product_name_snapshot), ''), product.name, package.name, line.content_snapshot, 'Item'),
        'content', line.content_snapshot,
        'quantity', coalesce(line.quantity, 0),
        'unitPrice', coalesce(line.unit_price, 0),
        'totalPrice', coalesce(line.total_price, coalesce(line.quantity, 0) * coalesce(line.unit_price, 0)),
        'isAddon', line.is_addon
      ) order by line.type_sort nulls last, line.item_order nulls last, line.created_at)
      from public.order_lines line
      left join public.products product on product.id = line.product_id
      left join public.packages package on package.id = line.package_id
      where line.order_id = v_order.id and not line.is_void
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', payment.id,
        'amount', payment.amount,
        'paymentAt', payment.payment_at,
        'method', method.name,
        'receiptReference', payment.receipt_reference
      ) order by coalesce(payment.payment_at, payment.created_at))
      from public.payments payment
      left join public.payment_methods method on method.id = payment.payment_method_id
      where payment.order_id = v_order.id and payment.voided_at is null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.customer_self_service_logout(p_session_token uuid)
returns void
language sql
security definer
set search_path = public, private
as $$
  delete from private.customer_self_service_sessions where token = p_session_token
$$;

revoke all on function public.customer_self_service_login(text, text) from public;
revoke all on function public.customer_self_service_orders(uuid) from public;
revoke all on function public.customer_self_service_order_detail(uuid, uuid) from public;
revoke all on function public.customer_self_service_logout(uuid) from public;

grant execute on function public.customer_self_service_login(text, text) to anon, authenticated;
grant execute on function public.customer_self_service_orders(uuid) to anon, authenticated;
grant execute on function public.customer_self_service_order_detail(uuid, uuid) to anon, authenticated;
grant execute on function public.customer_self_service_logout(uuid) to anon, authenticated;
