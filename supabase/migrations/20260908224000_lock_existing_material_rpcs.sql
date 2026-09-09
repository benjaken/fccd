-- Existing RPCs must acquire the material transaction gate BEFORE row locks.
-- Preserve each function's signature, invoker/definer mode and existing grants.
-- Invoker RPCs need EXECUTE; this helper only acquires a transaction lock.
grant execute on function private.lock_material_writes() to authenticated, service_role;

-- Latest prior definition: 20260822001000_delivery_fleet_acceptance_workflow.sql
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
  perform private.lock_material_writes();
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

-- Latest prior definition: 20260904194000_extend_order_line_label_remarks.sql
create or replace function public.convert_quote_to_order(p_quote_id uuid)
returns table(id uuid, order_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quote public.orders%rowtype;
  v_order_id uuid;
  v_order_number text;
begin
  perform private.lock_material_writes();
  select * into v_quote
  from public.orders
  where orders.id = p_quote_id
    and orders.document_type in ('quote', 'unconfirmed')
    and orders.archived_at is null
  for update;

  if not found then
    raise exception 'quote_not_found' using errcode = 'P0002';
  end if;

  select orders.id, orders.order_number into v_order_id, v_order_number
  from public.orders
  where orders.source_quote_id = p_quote_id
    and orders.document_type = 'order'
    and orders.archived_at is null
  limit 1;

  if v_order_id is not null then
    return query select v_order_id, v_order_number;
    return;
  end if;

  v_order_id := gen_random_uuid();

  insert into public.orders as inserted (
    id, legacy_id, source_quote_id, customer_id, channel_id, order_number,
    document_type, delivery_status, customer_name_snapshot,
    company_name_snapshot, email_snapshot, contact_number_a_snapshot,
    contact_number_b_snapshot, shipping_address_snapshot,
    customer_note_snapshot, quote_description_snapshot, delivery_terms_snapshot,
    currency, discount_amount, shipping_fee, cashdollar_purchased,
    cashdollar_redeemed, grand_total, outstanding, delivery_at, ship_out_time,
    remarks, factory_packing_note, shipping_method_id, delivery_time,
    sales_partner_id, asana_link, is_quote_original, is_sent_to_factory
  ) values (
    v_order_id, 'web-order-' || v_order_id, p_quote_id, v_quote.customer_id,
    v_quote.channel_id, null, 'order', 'Pending',
    v_quote.customer_name_snapshot, v_quote.company_name_snapshot,
    v_quote.email_snapshot, v_quote.contact_number_a_snapshot,
    v_quote.contact_number_b_snapshot, v_quote.shipping_address_snapshot,
    v_quote.customer_note_snapshot, v_quote.quote_description_snapshot,
    v_quote.delivery_terms_snapshot, v_quote.currency, v_quote.discount_amount,
    v_quote.shipping_fee, v_quote.cashdollar_purchased,
    v_quote.cashdollar_redeemed, v_quote.grand_total, v_quote.outstanding,
    v_quote.delivery_at, v_quote.ship_out_time, v_quote.remarks,
    v_quote.factory_packing_note, v_quote.shipping_method_id,
    v_quote.delivery_time, v_quote.sales_partner_id, v_quote.asana_link,
    false, false
  )
  returning inserted.order_number into v_order_number;

  insert into public.order_lines (
    id, legacy_id, order_id, product_id, package_id, sku_snapshot,
    product_name_snapshot, content_snapshot, quantity, new_quantity_text,
    unit_price, total_price, item_order, type_sort, remarks_1, remarks_2,
    label_remarks, delivery_at, is_addon, is_void, is_printed,
    is_sent_to_factory
  )
  select gen_random_uuid(), 'web-order-line-' || gen_random_uuid(), v_order_id,
    product_id, package_id, sku_snapshot, product_name_snapshot,
    content_snapshot, quantity, new_quantity_text, unit_price, total_price,
    item_order, type_sort, remarks_1, remarks_2, label_remarks, delivery_at,
    is_addon, false, false, false
  from public.order_lines
  where order_id = p_quote_id and is_void = false;

  insert into public.deliveries (
    id, legacy_id, order_id, district_id, shipping_method_id,
    delivery_at, delivery_time, ship_out_time, delivery_status, total_fee
  )
  select gen_random_uuid(), 'web-delivery-' || gen_random_uuid(), v_order_id,
    district_id, shipping_method_id, delivery_at, delivery_time, ship_out_time,
    'Pending', total_fee
  from public.deliveries
  where order_id = p_quote_id;

  insert into public.order_tag_assignments(order_id, order_tag_id)
  select v_order_id, order_tag_id
  from public.order_tag_assignments
  where order_id = p_quote_id
  on conflict do nothing;

  insert into public.payments (
    id, legacy_id, order_id, channel_id, payment_method_id,
    order_number_snapshot, currency, amount, payment_at, payout_at,
    paypal_reference, receipt_reference
  )
  select gen_random_uuid(), 'web-payment-' || gen_random_uuid(), v_order_id,
    channel_id, payment_method_id, v_order_number, currency, amount,
    payment_at, payout_at, paypal_reference, receipt_reference
  from public.payments
  where order_id = p_quote_id and voided_at is null;

  update public.orders
  set quote_status = 'Done Deal', archived_at = now(), updated_at = now()
  where orders.id = p_quote_id;

  return query select v_order_id, v_order_number;
end;
$$;

-- Latest prior definition: 20260824230000_factory_order_line_change_audit.sql
create or replace function public.acknowledge_factory_change(
  p_order_id uuid,
  p_delivery_note_printed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_task public.factory_change_tasks%rowtype;
  v_order record;
  v_had_audit boolean;
begin
  perform private.lock_material_writes();
  if private.jwt_app_role() not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'factory_change_ack_forbidden' using errcode = '42501';
  end if;

  select * into v_task from public.factory_change_tasks
  where order_id = p_order_id for update;
  if not found then return; end if;

  select exists (
    select 1 from public.factory_order_line_changes where order_id = p_order_id
  ) into v_had_audit;

  update public.factory_order_line_changes
  set resolved_at = now(), resolved_by = auth.uid()
  where order_id = p_order_id and operation = 'delete' and resolved_at is null;

  if v_had_audit and not exists (
    select 1 from public.factory_order_line_changes
    where order_id = p_order_id and resolved_at is null
  ) then
    update public.orders set factory_reprint_required = false, updated_at = now()
    where id = p_order_id;
  end if;

  select factory_reprint_required, created_by_user_id, order_number into v_order
  from public.orders where id = p_order_id;

  if v_task.needs_label_reprint and coalesce(v_order.factory_reprint_required, false) then
    raise exception 'factory_labels_still_require_reprint';
  end if;
  if v_task.needs_delivery_note_reprint and not p_delivery_note_printed then
    raise exception 'factory_delivery_note_still_requires_reprint';
  end if;

  update public.factory_change_tasks
  set status = 'acknowledged', acknowledged_at = now(), acknowledged_by = auth.uid()
  where order_id = p_order_id;

  update public.business_notifications
  set resolved_at = now(), updated_at = now()
  where event_type = 'factory_order_changed' and entity_id = p_order_id
    and resolved_at is null;

  perform private.upsert_business_notification(
    v_order.created_by_user_id, 'factory-change-ack:' || p_order_id,
    'factory_change_acknowledged', 'information', 'normal',
    '工場已確認訂單修改',
    concat(coalesce(v_order.order_number, '未編號訂單'), ' 的打印及現場資料已更新。'),
    'order', p_order_id, '/orders/' || p_order_id, '{}'::jsonb
  );
end;
$$;

-- Latest prior definition: 20260825220000_reconcile_july_order_duplicates.sql
create or replace function public.reconcile_shopify_order_shadow(
  p_shadow_order_id uuid,
  p_canonical_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shadow public.orders%rowtype;
  v_canonical public.orders%rowtype;
  v_now timestamptz := now();
begin
  perform private.lock_material_writes();
  if p_shadow_order_id = p_canonical_order_id then
    raise exception 'shopify_order_reconcile_same_order' using errcode = '22023';
  end if;

  select * into v_shadow
  from public.orders
  where id = p_shadow_order_id
  for update;

  select * into v_canonical
  from public.orders
  where id = p_canonical_order_id
  for update;

  if v_shadow.id is null or v_canonical.id is null then
    raise exception 'shopify_order_reconcile_not_found' using errcode = 'P0002';
  end if;

  if v_shadow.merged_into_order_id = p_canonical_order_id then
    return p_canonical_order_id;
  end if;

  if v_shadow.archived_at is not null
    or v_canonical.archived_at is not null
    or v_shadow.source_system is distinct from 'shopify'
    or v_canonical.source_system is distinct from 'bubble'
    or v_shadow.shopify_order_id is null
  then
    raise exception 'shopify_order_reconcile_invalid_sources' using errcode = '22023';
  end if;

  if upper(regexp_replace(coalesce(v_shadow.order_number, ''), '[^A-Z0-9]', '', 'g'))
      is distinct from
     upper(regexp_replace(coalesce(v_canonical.order_number, ''), '[^A-Z0-9]', '', 'g'))
    or v_shadow.grand_total is distinct from v_canonical.grand_total
  then
    raise exception 'shopify_order_reconcile_mismatch' using errcode = '22023';
  end if;

  if not (
    nullif(lower(btrim(v_shadow.email_snapshot)), '') is not null
      and lower(btrim(v_shadow.email_snapshot)) = lower(btrim(v_canonical.email_snapshot))
    or nullif(regexp_replace(coalesce(v_shadow.contact_number_a_snapshot, ''), '[^0-9]', '', 'g'), '') is not null
      and regexp_replace(coalesce(v_shadow.contact_number_a_snapshot, ''), '[^0-9]', '', 'g') =
          regexp_replace(coalesce(v_canonical.contact_number_a_snapshot, ''), '[^0-9]', '', 'g')
  ) then
    raise exception 'shopify_order_reconcile_customer_mismatch' using errcode = '22023';
  end if;

  if v_canonical.shopify_order_id is not null
    and v_canonical.shopify_order_id is distinct from v_shadow.shopify_order_id
  then
    raise exception 'shopify_order_reconcile_already_linked' using errcode = '23505';
  end if;

  -- An operational Bubble order is the normal canonical row. For newly
  -- created orders, also accept a tightly bounded Shopify/Bubble pair: same
  -- order number, amount and customer, created no more than ten minutes apart.
  if v_canonical.is_sent_to_factory is distinct from true
    and not exists (
      select 1 from public.deliveries where order_id = p_canonical_order_id
    )
    and abs(extract(epoch from (
      coalesce(v_shadow.bubble_created_at, v_shadow.created_at) -
      coalesce(v_canonical.bubble_created_at, v_canonical.created_at)
    ))) > 600
  then
    raise exception 'shopify_order_reconcile_not_operational' using errcode = '22023';
  end if;

  update public.payments as shopify_payment
  set voided_at = v_now
  where shopify_payment.order_id = p_shadow_order_id
    and shopify_payment.voided_at is null
    and exists (
      select 1
      from public.payments as canonical_payment
      where canonical_payment.order_id = p_canonical_order_id
        and canonical_payment.voided_at is null
        and canonical_payment.amount = shopify_payment.amount
        and upper(coalesce(canonical_payment.currency, 'HKD')) =
            upper(coalesce(shopify_payment.currency, 'HKD'))
        and (canonical_payment.payment_at at time zone 'Asia/Hong_Kong')::date =
            (shopify_payment.payment_at at time zone 'Asia/Hong_Kong')::date
    );

  update public.payments
  set order_id = p_canonical_order_id,
      order_legacy_id = v_canonical.legacy_id,
      order_number_snapshot = v_canonical.order_number
  where order_id = p_shadow_order_id
    and voided_at is null;

  update public.orders
  set shopify_store_id = null,
      shopify_order_id = null,
      is_shopify_order = false,
      merged_into_order_id = p_canonical_order_id,
      archived_at = v_now,
      updated_at = v_now
  where id = p_shadow_order_id;

  update public.orders
  set shopify_store_id = v_shadow.shopify_store_id,
      shopify_order_id = v_shadow.shopify_order_id,
      is_shopify_order = true,
      payment_status_source = 'shopify',
      shopify_financial_status = v_shadow.shopify_financial_status,
      shopify_financial_status_synced_at = v_shadow.shopify_financial_status_synced_at,
      outstanding = v_shadow.outstanding,
      updated_at = v_now
  where id = p_canonical_order_id;

  return p_canonical_order_id;
end;
$$;

-- Latest prior definition: 20260824120000_defer_delivery_until_factory_send.sql
create or replace function public.set_order_factory_status(
  p_order_id uuid,
  p_sent boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_delivery_id uuid;
begin
  perform private.lock_material_writes();
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
    or v_order.document_type is distinct from 'order'
    or v_order.archived_at is not null
  then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if p_sent and coalesce(v_order.do_not_send_to_factory, false) then
    raise exception 'order_factory_send_disabled' using errcode = '22023';
  end if;

  if p_sent and v_order.delivery_district_id is null then
    raise exception 'order_delivery_district_required' using errcode = '22023';
  end if;

  update public.orders
  set is_sent_to_factory = p_sent,
      updated_at = now()
  where id = p_order_id;

  select delivery.id into v_delivery_id
  from public.deliveries as delivery
  where delivery.order_id = p_order_id
  order by delivery.created_at, delivery.id
  limit 1;

  if p_sent and v_delivery_id is null then
    v_delivery_id := gen_random_uuid();
    insert into public.deliveries (
      id,
      legacy_id,
      order_id,
      district_id,
      shipping_method_id,
      delivery_at,
      delivery_time,
      ship_out_time,
      delivery_status,
      total_fee
    ) values (
      v_delivery_id,
      'web-delivery-' || v_delivery_id,
      p_order_id,
      v_order.delivery_district_id,
      v_order.shipping_method_id,
      v_order.delivery_at,
      v_order.delivery_time,
      v_order.ship_out_time,
      '未派車隊',
      v_order.shipping_fee
    );
  end if;

  return v_delivery_id;
end;
$$;

-- Latest prior definition: 20260904194000_extend_order_line_label_remarks.sql
create or replace function public.save_sales_document_batch(
  p_order_id uuid,
  p_document_type text,
  p_lines jsonb,
  p_shipping_fee numeric,
  p_discount_amount numeric,
  p_cashdollar_redeemed numeric,
  p_cashdollar_purchased numeric,
  p_payments jsonb,
  p_channel_id uuid,
  p_order_number text,
  p_factory_settings jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.lock_material_writes();
  if not private.has_sales_document_manage(p_order_id) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if p_document_type not in ('quote', 'unconfirmed', 'order') then
    raise exception 'invalid_document_type' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payments, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_batch_payload' using errcode = '22023';
  end if;
  if least(
    coalesce(p_shipping_fee, 0),
    coalesce(p_discount_amount, 0),
    coalesce(p_cashdollar_redeemed, 0),
    coalesce(p_cashdollar_purchased, 0)
  ) < 0 then
    raise exception 'invalid_order_financials' using errcode = '22023';
  end if;

  perform 1
  from public.orders
  where id = p_order_id
    and document_type = p_document_type
    and archived_at is null
  for update;
  if not found then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
      as item(id uuid, quantity numeric, unit_price numeric, remarks text, remarks_1 text, remarks_2 text, label_remarks jsonb)
    left join public.order_lines line
      on line.id = item.id and line.order_id = p_order_id and not line.is_void
    where line.id is null
      or item.quantity is null
      or item.quantity < 0
      or item.quantity <> trunc(item.quantity)
      or item.unit_price is null
      or item.unit_price < 0
      or (item.label_remarks is not null and jsonb_typeof(item.label_remarks) <> 'array')
  ) then
    raise exception 'invalid_order_line' using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
      as item(id uuid, quantity numeric, unit_price numeric, remarks text, remarks_1 text, remarks_2 text, label_remarks jsonb)
  ) <> (
    select count(distinct item.id)
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
      as item(id uuid, quantity numeric, unit_price numeric, remarks text, remarks_1 text, remarks_2 text, label_remarks jsonb)
  ) then
    raise exception 'duplicate_order_line' using errcode = '22023';
  end if;

  update public.order_lines line
  set quantity = item.quantity,
      unit_price = item.unit_price,
      total_price = round(item.quantity * item.unit_price, 2),
      label_remarks = case
        when item.label_remarks is not null
          then array(select jsonb_array_elements_text(item.label_remarks))
        else array_remove(array[coalesce(item.remarks_1, item.remarks), item.remarks_2], null)
      end,
      remarks_1 = nullif(btrim(coalesce(item.label_remarks ->> 0, item.remarks_1, item.remarks)), ''),
      remarks_2 = nullif(btrim(coalesce(item.label_remarks ->> 1, item.remarks_2)), ''),
      updated_at = now()
  from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
    as item(id uuid, quantity numeric, unit_price numeric, remarks text, remarks_1 text, remarks_2 text, label_remarks jsonb)
  where line.id = item.id
    and line.order_id = p_order_id
    and not line.is_void;

  update public.orders
  set shipping_fee = coalesce(p_shipping_fee, 0),
      discount_amount = coalesce(p_discount_amount, 0),
      cashdollar_redeemed = coalesce(p_cashdollar_redeemed, 0),
      cashdollar_purchased = coalesce(p_cashdollar_purchased, 0),
      do_not_send_to_factory = case
        when p_document_type = 'order'
          then coalesce((p_factory_settings ->> 'doNotSendToFactory')::boolean, false)
        else do_not_send_to_factory
      end,
      updated_at = now()
  where id = p_order_id;

  if p_document_type = 'order' then
    if exists (
      select 1
      from jsonb_to_recordset(coalesce(p_payments, '[]'::jsonb))
        as payment(id uuid, payment_at timestamptz, payment_method_id uuid, amount numeric, reference text)
      left join public.payments existing on existing.id = payment.id
      where payment.id is null
        or payment.payment_at is null
        or payment.payment_method_id is null
        or payment.amount is null
        or payment.amount <= 0
        or (existing.id is not null and existing.order_id <> p_order_id)
    ) then
      raise exception 'invalid_order_payment' using errcode = '22023';
    end if;

    update public.payments payment
    set voided_at = now()
    where payment.order_id = p_order_id
      and payment.voided_at is null
      and not exists (
        select 1
        from jsonb_to_recordset(coalesce(p_payments, '[]'::jsonb))
          as incoming(id uuid, payment_at timestamptz, payment_method_id uuid, amount numeric, reference text)
        where incoming.id = payment.id
      );

    insert into public.payments (
      id, legacy_id, order_id, channel_id, payment_method_id,
      order_number_snapshot, currency, amount, payment_at,
      receipt_reference, voided_at
    )
    select
      payment.id,
      'web-order-payment-' || payment.id,
      p_order_id,
      p_channel_id,
      payment.payment_method_id,
      nullif(btrim(p_order_number), ''),
      'HKD',
      payment.amount,
      payment.payment_at,
      nullif(btrim(payment.reference), ''),
      null
    from jsonb_to_recordset(coalesce(p_payments, '[]'::jsonb))
      as payment(id uuid, payment_at timestamptz, payment_method_id uuid, amount numeric, reference text)
    on conflict (id) do update
    set channel_id = excluded.channel_id,
        payment_method_id = excluded.payment_method_id,
        order_number_snapshot = excluded.order_number_snapshot,
        amount = excluded.amount,
        payment_at = excluded.payment_at,
        receipt_reference = excluded.receipt_reference,
        voided_at = null;

    if coalesce((p_factory_settings ->> 'suppressFactoryReprint')::boolean, false)
       and not coalesce((p_factory_settings ->> 'doNotSendToFactory')::boolean, false)
       and nullif(p_factory_settings ->> 'factoryPrintDate', '') is not null
       and not coalesce((p_factory_settings ->> 'originalFactoryReprintRequired')::boolean, false) then
      update public.order_lines
      set is_printed = true,
          updated_at = now()
      where order_id = p_order_id and not is_void;

      update public.orders
      set factory_reprint_required = false,
          factory_print_date = now(),
          updated_at = now()
      where id = p_order_id;
    end if;
  end if;

  perform private.recalculate_quote_total(p_order_id);
end;
$$;

-- Latest prior definition: 20260828145000_make_self_service_addons_cross_channel.sql
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
  perform private.lock_material_writes();
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
    on setting.product_id = item.product_id
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

-- Latest prior definition: 20260828130000_customer_self_service_addons.sql
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
  perform private.lock_material_writes();
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

-- Latest prior definition: 20260828130000_customer_self_service_addons.sql
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
  perform private.lock_material_writes();
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

-- Latest prior definition: 20260905033000_fix_database_lint_and_customer_service_utf8.sql
create or replace function public.convert_enquiry_to_quote(
  p_submission_id uuid,
  p_channel_id uuid
)
returns table(id uuid, order_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.enquiry_submissions;
  v_quote_id uuid;
  v_order_number text;
  v_remarks text;
begin
  perform private.lock_material_writes();
  if not private.has_page_manage('quotes') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_channel_id is null then
    raise exception 'channel_required' using errcode = '22023';
  end if;

  select submissions.* into v_row
  from public.enquiry_submissions submissions
  where submissions.id = p_submission_id
  for update;
  if not found then
    raise exception 'submission_not_found' using errcode = '22023';
  end if;
  if v_row.converted_quote_id is not null then
    select orders.id, orders.order_number into v_quote_id, v_order_number
    from public.orders orders where orders.id = v_row.converted_quote_id;
    return query select v_quote_id, v_order_number;
    return;
  end if;

  if nullif(btrim(coalesce(v_row.customer_name, '')), '') is null then
    raise exception 'customer_required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(v_row.email, '')), '') is null
     and nullif(btrim(coalesce(v_row.phone, '')), '') is null then
    raise exception 'contact_required' using errcode = '22023';
  end if;

  v_remarks := case
    when nullif(btrim(coalesce(v_row.headcount, '')), '') is not null
      then '人數：' || btrim(v_row.headcount)
    else null
  end;

  select quote.id, quote.order_number into v_quote_id, v_order_number
  from public.create_quote(
    p_channel_id, v_row.customer_name, v_row.company_name, v_row.phone,
    null, v_row.email, v_row.shipping_address, null, null, null,
    v_row.delivery_date, v_row.delivery_time, null, v_row.quote_description,
    null, null, v_remarks, '{}'::uuid[], null
  ) as quote;

  update public.orders orders
  set enquiry_submission_id = v_row.id,
    source_system = 'enquiry_form',
    asana_link = v_row.asana_link,
    quote_description_snapshot = coalesce(orders.quote_description_snapshot, v_row.quote_description),
    updated_at = now()
  where orders.id = v_quote_id;

  update public.enquiry_submissions submissions
  set converted_quote_id = v_quote_id, updated_at = now()
  where submissions.id = v_row.id;

  return query select v_quote_id, v_order_number;
end;
$$;

-- Latest prior definition: 20260828130000_customer_self_service_addons.sql
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
  perform private.lock_material_writes();
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

-- Latest prior definition: 20260908223000_allow_incomplete_payment_settlement_metadata.sql
create or replace function public.reconcile_payment_settlement_permission_impl(
  p_payment_ids uuid[],
  p_payout_date_mode text,
  p_payout_at date,
  p_charges numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_count integer;
  v_channel_id uuid;
  v_channel_legacy_id text;
  v_payment_method_id uuid;
  v_payment_method_legacy_id text;
  v_gross_amount numeric(14, 2);
  v_settlement_id uuid := gen_random_uuid();
begin
  perform private.lock_material_writes();
  if coalesce(array_length(p_payment_ids, 1), 0) = 0 then
    raise exception 'at least one payment is required';
  end if;
  if p_payout_date_mode not in ('custom', 'payment') then
    raise exception 'invalid payout date mode';
  end if;
  if p_payout_date_mode = 'custom' and p_payout_at is null then
    raise exception 'a custom payout date is required';
  end if;
  if coalesce(p_charges, 0) < 0 then
    raise exception 'charges cannot be negative';
  end if;
  if p_payout_date_mode = 'payment' and coalesce(p_charges, 0) <> 0 then
    raise exception 'payment-date reconciliation cannot include charges';
  end if;

  with locked_payments as materialized (
    select payment.*
    from public.payments as payment
    where payment.id = any(p_payment_ids)
      and payment.voided_at is null
    for update
  ),
  selected_payments as (
    select payment.*
    from locked_payments as payment
    where not exists (
      select 1
      from public.payment_settlement_payments relation
      where relation.payment_id = payment.id
    )
  )
  select
    count(*),
    min(channel_id::text)::uuid,
    min(channel_legacy_id),
    min(payment_method_id::text)::uuid,
    min(payment_method_legacy_id),
    coalesce(sum(amount), 0)
  into
    v_payment_count,
    v_channel_id,
    v_channel_legacy_id,
    v_payment_method_id,
    v_payment_method_legacy_id,
    v_gross_amount
  from selected_payments;

  if v_payment_count <> cardinality(array(select distinct unnest(p_payment_ids))) then
    raise exception 'one or more payments are unavailable for reconciliation';
  end if;
  if exists (
    select 1
    from public.payments payment
    where payment.id = any(p_payment_ids)
      and (
        payment.channel_id is distinct from v_channel_id
        or payment.payment_method_id is distinct from v_payment_method_id
      )
  ) then
    raise exception 'payments must share one channel and payment method';
  end if;
  if v_gross_amount - coalesce(p_charges, 0) < 0 then
    raise exception 'net amount cannot be negative';
  end if;

  insert into public.payment_settlements (
    id,
    legacy_id,
    channel_id,
    channel_legacy_id,
    payment_method_id,
    payment_method_legacy_id,
    payout_at,
    gross_amount,
    charges,
    net_amount
  ) values (
    v_settlement_id,
    'manual-reconciliation:' || v_settlement_id::text,
    v_channel_id,
    v_channel_legacy_id,
    v_payment_method_id,
    v_payment_method_legacy_id,
    case
      when p_payout_date_mode = 'custom'
        then p_payout_at::timestamp at time zone 'Asia/Hong_Kong'
      else null
    end,
    v_gross_amount,
    coalesce(p_charges, 0),
    v_gross_amount - coalesce(p_charges, 0)
  );

  insert into public.payment_settlement_payments (
    payment_settlement_id,
    payment_id,
    payment_settlement_legacy_id,
    payment_legacy_id
  )
  select
    v_settlement_id,
    payment.id,
    'manual-reconciliation:' || v_settlement_id::text,
    payment.legacy_id
  from public.payments payment
  where payment.id = any(p_payment_ids);

  update public.payments
  set payout_at = case
      when p_payout_date_mode = 'custom'
        then p_payout_at::timestamp at time zone 'Asia/Hong_Kong'
      else payment_at
    end,
    updated_at = now()
  where id = any(p_payment_ids);

  return v_settlement_id;
end;
$$;

-- Latest prior definition: 20260825050000_permission_driven_operational_writes.sql
create or replace function public.update_payment_settlement_permission_impl(
  p_settlement_id uuid,
  p_invoice_number text,
  p_receipt_number text,
  p_payout_at date,
  p_charges numeric,
  p_payment_ids uuid[],
  p_preserve_payment_amount boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_channel_id uuid;
  v_payment_method_id uuid;
  v_gross_amount numeric(14, 2);
begin
  perform private.lock_material_writes();
  if p_settlement_id is null or p_payout_at is null or coalesce(p_charges, 0) < 0 then
    raise exception 'invalid settlement details';
  end if;

  select channel_id, payment_method_id, coalesce(gross_amount, 0)
  into v_channel_id, v_payment_method_id, v_gross_amount
  from public.payment_settlements
  where id = p_settlement_id
  for update;
  if not found then
    raise exception 'settlement not found';
  end if;

  if p_preserve_payment_amount then
    if not exists (
      select 1
      from public.payment_settlement_payments relation
      left join public.payments payment on payment.id = relation.payment_id
      where relation.payment_settlement_id = p_settlement_id
        and payment.order_id is null
    )
    and exists (
      select 1
      from public.payment_settlement_payments relation
      where relation.payment_settlement_id = p_settlement_id
    )
    and abs(v_gross_amount - coalesce((
      select sum(payment.amount)
      from public.payment_settlement_payments relation
      join public.payments payment on payment.id = relation.payment_id
      where relation.payment_settlement_id = p_settlement_id
    ), 0)) < 0.01 then
      raise exception 'verified settlement payment amount cannot be preserved';
    end if;
    if v_gross_amount - p_charges < 0 then
      raise exception 'net amount cannot be negative';
    end if;
    update public.payment_settlements
    set invoice_number = nullif(trim(p_invoice_number), ''),
        receipt_number = nullif(trim(p_receipt_number), ''),
        payout_at = p_payout_at::timestamp at time zone 'Asia/Hong_Kong',
        charges = p_charges,
        net_amount = v_gross_amount - p_charges
    where id = p_settlement_id;
    return;
  end if;

  if coalesce(array_length(p_payment_ids, 1), 0) = 0 then
    raise exception 'at least one payment is required';
  end if;
  if exists (
    select 1
    from public.payments payment
    where payment.id = any(p_payment_ids)
      and (
        payment.voided_at is not null
        or payment.channel_id is distinct from v_channel_id
        or payment.payment_method_id is distinct from v_payment_method_id
      )
  ) then
    raise exception 'payments must match the settlement channel and payment method';
  end if;
  if exists (
    select 1
    from public.payment_settlement_payments relation
    where relation.payment_id = any(p_payment_ids)
      and relation.payment_settlement_id <> p_settlement_id
  ) then
    raise exception 'a payment is already reconciled elsewhere';
  end if;

  select coalesce(sum(amount), 0)
  into v_gross_amount
  from public.payments
  where id = any(p_payment_ids);
  if v_gross_amount - p_charges < 0 then
    raise exception 'net amount cannot be negative';
  end if;

  delete from public.payment_settlement_payments
  where payment_settlement_id = p_settlement_id;
  insert into public.payment_settlement_payments (
    payment_settlement_id,
    payment_id,
    payment_settlement_legacy_id,
    payment_legacy_id
  )
  select p_settlement_id, payment.id, settlement.legacy_id, payment.legacy_id
  from public.payments payment
  cross join public.payment_settlements settlement
  where settlement.id = p_settlement_id
    and payment.id = any(p_payment_ids);

  update public.payment_settlements
  set invoice_number = nullif(trim(p_invoice_number), ''),
      receipt_number = nullif(trim(p_receipt_number), ''),
      payout_at = p_payout_at::timestamp at time zone 'Asia/Hong_Kong',
      gross_amount = v_gross_amount,
      charges = p_charges,
      net_amount = v_gross_amount - p_charges
  where id = p_settlement_id;
  update public.payments
  set payout_at = p_payout_at::timestamp at time zone 'Asia/Hong_Kong',
      updated_at = now()
  where id = any(p_payment_ids);
end;
$$;

-- Payment writes can recalculate orders through existing triggers.
create trigger lock_material_write_statement before insert or update or delete on public.payments
for each statement execute function private.lock_material_write_statement();
create trigger lock_material_write_statement before insert or update or delete on public.customer_self_service_addon_checkouts
for each statement execute function private.lock_material_write_statement();

-- Preserve delivery/material history while keeping the existing cancellation API.
create or replace function public.cancel_pending_delivery(p_delivery_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $cancel$
declare v_order_id uuid; v_status text;
begin
  if coalesce((select auth.jwt())->'app_metadata'->>'role','') not in ('Super Admin','Admin','Accounting','Factory') then
    raise exception 'not allowed to cancel delivery' using errcode='42501';
  end if;
  perform private.lock_material_writes();
  select delivery.order_id, coalesce(nullif(btrim(delivery.delivery_status),''),orders.delivery_status)
    into v_order_id,v_status from public.deliveries delivery
    left join public.orders orders on orders.id=delivery.order_id where delivery.id=p_delivery_id;
  if not found then raise exception 'delivery not found' using errcode='P0002'; end if;
  if v_status='已取消' then return; end if;
  if v_status is distinct from '待取貨' then
    raise exception 'only pending pickup deliveries can be cancelled' using errcode='23514';
  end if;
  delete from public.delivery_surcharges where delivery_id=p_delivery_id;
  update public.deliveries set delivery_status='已取消', basic_fee=0, total_fee=0, updated_at=now()
    where id=p_delivery_id;
  if v_order_id is not null then
    update public.orders set delivery_status='未派車隊',updated_at=now()
      where id=v_order_id and delivery_status='待取貨'
        and not exists (select 1 from public.deliveries where order_id=v_order_id
          and coalesce(delivery_status,'') not in ('已取消','取消','Cancelled','cancelled'));
  end if;
end;
$cancel$;
revoke all on function public.cancel_pending_delivery(uuid) from public,anon;
grant execute on function public.cancel_pending_delivery(uuid) to authenticated;

-- Acquire the material gate before quote-number advisory locks.
-- Latest prior definition: 20260903024142_qualify_create_quote_order_number.sql
create or replace function public.create_quote(
  p_channel_id uuid default null,
  p_customer_name text default null,
  p_company_name text default null,
  p_contact_a text default null,
  p_contact_b text default null,
  p_email text default null,
  p_address text default null,
  p_district_id uuid default null,
  p_district_name text default null,
  p_shipping_method_id uuid default null,
  p_delivery_date date default null,
  p_delivery_time text default null,
  p_ship_out_time text default null,
  p_customer_note text default null,
  p_packing_note text default null,
  p_sales_partner_id uuid default null,
  p_internal_note text default null,
  p_order_tag_ids uuid[] default '{}',
  p_order_number text default null
)
returns table(id uuid, order_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_delivery_id uuid := gen_random_uuid();
  v_month text := to_char(timezone('Asia/Hong_Kong', now()), 'YYYYMM');
  v_sequence integer;
  v_order_number text := nullif(btrim(coalesce(p_order_number, '')), '');
  v_delivery_at timestamptz;
  v_district_id uuid := p_district_id;
begin
  perform private.lock_material_writes();
  if p_channel_id is null then
    raise exception 'channel_required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_customer_name, '')), '') is null
     and nullif(btrim(coalesce(p_company_name, '')), '') is null then
    raise exception 'customer_required' using errcode = '22023';
  end if;

  if v_order_number is null then
    perform pg_advisory_xact_lock(hashtext('quote-number-' || v_month));
    select coalesce(max(substring(o.order_number from 11)::integer), 0) + 1
      into v_sequence
    from public.orders o
    where o.order_number ~ ('^FCLQ' || v_month || '[0-9]+$');
    v_order_number := 'FCLQ' || v_month || lpad(v_sequence::text, 2, '0');
  end if;

  if p_delivery_date is not null then
    v_delivery_at := p_delivery_date::timestamp at time zone 'Asia/Hong_Kong';
  end if;

  if v_district_id is null and nullif(btrim(coalesce(p_district_name, '')), '') is not null then
    select d.id into v_district_id
    from public.delivery_districts d
    where lower(btrim(d.name)) = lower(btrim(p_district_name))
      and d.archived_at is null
    order by d.created_at
    limit 1;
    if v_district_id is null then
      v_district_id := gen_random_uuid();
      insert into public.delivery_districts(id, legacy_id, name)
      values (v_district_id, 'web-auto-district-' || v_district_id, btrim(p_district_name));
    end if;
  end if;

  insert into public.orders (
    id, legacy_id, channel_id, order_number, document_type, quote_status,
    customer_name_snapshot, company_name_snapshot, email_snapshot,
    contact_number_a_snapshot, contact_number_b_snapshot,
    shipping_address_snapshot, customer_note_snapshot,
    shipping_method_id, delivery_at, delivery_time, ship_out_time,
    factory_packing_note, sales_partner_id, remarks,
    grand_total, outstanding, is_quote_original
  ) values (
    v_id, 'web-quote-' || v_id, p_channel_id, v_order_number, 'quote', 'Draft',
    nullif(btrim(p_customer_name), ''), nullif(btrim(p_company_name), ''),
    nullif(btrim(p_email), ''), nullif(btrim(p_contact_a), ''),
    nullif(btrim(p_contact_b), ''), nullif(btrim(p_address), ''),
    nullif(btrim(p_customer_note), ''), p_shipping_method_id, v_delivery_at,
    nullif(btrim(p_delivery_time), ''), nullif(btrim(p_ship_out_time), ''),
    nullif(btrim(p_packing_note), ''), p_sales_partner_id,
    nullif(btrim(p_internal_note), ''), 0, 0, true
  )
  returning public.orders.order_number into v_order_number;

  if v_district_id is not null or p_shipping_method_id is not null or p_delivery_date is not null then
    insert into public.deliveries (
      id, legacy_id, order_id, district_id, shipping_method_id,
      delivery_at, delivery_time, ship_out_time, delivery_status
    ) values (
      v_delivery_id, 'web-delivery-' || v_delivery_id, v_id, v_district_id,
      p_shipping_method_id, v_delivery_at, nullif(btrim(p_delivery_time), ''),
      nullif(btrim(p_ship_out_time), ''), 'Pending'
    );
  end if;

  insert into public.order_tag_assignments(order_id, order_tag_id)
  select v_id, tag_id
  from unnest(coalesce(p_order_tag_ids, '{}')) as tag_id
  on conflict do nothing;

  return query select v_id, v_order_number;
end;
$$;

-- Acquire the material gate before quote-number advisory locks.
-- Latest prior definition: 20260904133000_whatsapp_customer_service_rpcs.sql
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
  perform private.lock_material_writes();
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
