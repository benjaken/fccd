-- WhatsApp customer-service lookup and inquiry write.
-- Service-role only. Does not alter wati_notification_controls.

create or replace function public.customer_service_controls_get()
returns table (
  bot_enabled boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if auth.role() is distinct from 'service_role'
     and not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
  select controls.bot_enabled, controls.updated_at
  from public.customer_service_controls controls
  where controls.id = 'global';
end;
$$;

grant execute on function public.customer_service_controls_get() to authenticated, service_role;

create or replace function public.customer_service_lookup_orders(p_phone text)
returns table (
  order_id uuid,
  order_number text,
  order_date date,
  delivery_at timestamptz,
  delivery_status text,
  masked_email text,
  masked_address text,
  addon_url text
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_phone text := private.self_service_phone(p_phone);
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if length(coalesce(v_phone, '')) < 8 then
    return;
  end if;

  return query
  select
    orders.id,
    orders.order_number,
    (timezone('Asia/Hong_Kong', coalesce(orders.effective_created_at, orders.created_at)))::date,
    orders.delivery_at,
    orders.delivery_status,
    private.self_service_mask_email(orders.email_snapshot),
    case
      when length(btrim(coalesce(orders.shipping_address_snapshot, ''))) <= 8
        then repeat('*', greatest(length(btrim(coalesce(orders.shipping_address_snapshot, ''))), 2))
      else left(btrim(orders.shipping_address_snapshot), 4)
        || repeat('*', 4)
        || right(btrim(orders.shipping_address_snapshot), 4)
    end,
    'https://www.foodchannels-delivery.com/self_service_search/' || orders.id::text
  from public.orders
  where orders.document_type = 'order'
    and orders.archived_at is null
    and (
      private.self_service_phone(orders.contact_number_a_snapshot) = v_phone
      or private.self_service_phone(orders.contact_number_b_snapshot) = v_phone
    )
  order by coalesce(orders.delivery_at, orders.effective_created_at, orders.created_at) desc,
    orders.order_number;
end;
$$;

create or replace function public.customer_service_write_inquiry(
  p_phone text,
  p_event_date text default null,
  p_headcount text default null,
  p_budget text default null,
  p_dietary text default null,
  p_cuisine text default null,
  p_note text default null,
  p_another_event boolean default false
)
returns table (
  quote_id uuid,
  order_number text,
  created boolean
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_phone text := private.self_service_phone(p_phone);
  v_summary text;
  v_existing public.orders%rowtype;
  v_id uuid;
  v_month text := to_char(timezone('Asia/Hong_Kong', now()), 'YYYYMM');
  v_sequence integer;
  v_order_number text;
  v_now timestamptz := now();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if length(coalesce(v_phone, '')) < 8 then
    raise exception 'phone_required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_event_date, '')), '') is null
     and nullif(btrim(coalesce(p_headcount, '')), '') is null then
    raise exception 'inquiry_slot_required' using errcode = '22023';
  end if;

  v_summary := concat_ws(
    E'\n',
    'WhatsApp 到會意見',
    nullif('日期：' || btrim(coalesce(p_event_date, '')), '日期：'),
    nullif('人數：' || btrim(coalesce(p_headcount, '')), '人數：'),
    nullif('預算：' || btrim(coalesce(p_budget, '')), '預算：'),
    nullif('忌口：' || btrim(coalesce(p_dietary, '')), '忌口：'),
    nullif('菜式：' || btrim(coalesce(p_cuisine, '')), '菜式：'),
    nullif(btrim(coalesce(p_note, '')), '')
  );

  if not coalesce(p_another_event, false) then
    select *
      into v_existing
    from public.orders
    where document_type = 'quote'
      and archived_at is null
      and coalesce(quote_status, '') not in ('Done Deal', 'Case Closed')
      and (
        private.self_service_phone(contact_number_a_snapshot) = v_phone
        or private.self_service_phone(contact_number_b_snapshot) = v_phone
      )
    order by coalesce(updated_at, created_at) desc
    limit 1;
  end if;

  if v_existing.id is not null then
    update public.orders
    set
      remarks = nullif(concat_ws(E'\n\n', nullif(btrim(coalesce(remarks, '')), ''), v_summary), ''),
      quote_description_snapshot = nullif(
        concat_ws(E'\n', nullif(btrim(coalesce(quote_description_snapshot, '')), ''), v_summary),
        ''
      ),
      delivery_at = coalesce(
        case
          when btrim(coalesce(p_event_date, '')) ~ '^\d{4}-\d{2}-\d{2}$'
            then (btrim(p_event_date) || ' 00:00:00')::timestamp at time zone 'Asia/Hong_Kong'
          else null
        end,
        delivery_at
      ),
      updated_at = v_now
    where id = v_existing.id;
    quote_id := v_existing.id;
    order_number := v_existing.order_number;
    created := false;
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('quote-number-' || v_month));
  select coalesce(max(substring(o.order_number from 11)::integer), 0) + 1
    into v_sequence
  from public.orders o
  where o.order_number ~ ('^FCLQ' || v_month || '[0-9]+$');
  v_order_number := 'FCLQ' || v_month || lpad(v_sequence::text, 2, '0');
  v_id := gen_random_uuid();

  insert into public.orders (
    id,
    legacy_id,
    order_number,
    document_type,
    source_system,
    quote_status,
    customer_name_snapshot,
    contact_number_a_snapshot,
    quote_description_snapshot,
    remarks,
    delivery_at,
    currency,
    is_quote_original,
    created_at,
    updated_at
  ) values (
    v_id,
    'whatsapp:' || v_phone || ':' || v_id,
    v_order_number,
    'quote',
    'whatsapp',
    null,
    'WhatsApp 客人',
    v_phone,
    v_summary,
    v_summary,
    case
      when btrim(coalesce(p_event_date, '')) ~ '^\d{4}-\d{2}-\d{2}$'
        then (btrim(p_event_date) || ' 00:00:00')::timestamp at time zone 'Asia/Hong_Kong'
      else null
    end,
    'HKD',
    true,
    v_now,
    v_now
  );

  quote_id := v_id;
  order_number := v_order_number;
  created := true;
  return next;
end;
$$;

revoke all on function public.customer_service_lookup_orders(text) from public, anon, authenticated;
revoke all on function public.customer_service_write_inquiry(text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.customer_service_lookup_orders(text) to service_role;
grant execute on function public.customer_service_write_inquiry(text, text, text, text, text, text, text, boolean) to service_role;
