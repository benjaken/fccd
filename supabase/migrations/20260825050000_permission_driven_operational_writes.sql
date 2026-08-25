-- Extend configurable page management to product, package, payment and frozen
-- inventory writes. Existing Admin access is preserved as the initial default.

update public.role_page_permissions
set can_access = true,
    can_manage = true,
    updated_at = now()
where role = 'Admin'
  and page_key in (
    'products',
    'products.packages',
    'delivery',
    'orders.payments',
    'frozen.prepared_meat_inventory',
    'frozen.delivery_notes'
  );

do $$
declare
  table_name text;
  permission_key text;
begin
  for table_name, permission_key in
    select * from (values
      ('products', 'products'),
      ('packages', 'products.packages'),
      ('package_products', 'products.packages')
    ) as permission_tables(table_name, permission_key)
  loop
    execute format('drop policy if exists "Administrators insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Administrators update %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "Administrators delete %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "Page managers insert %1$s" on public.%1$I for insert to authenticated with check (private.has_page_manage(%2$L))',
      table_name, permission_key
    );
    execute format(
      'create policy "Page managers update %1$s" on public.%1$I for update to authenticated using (private.has_page_manage(%2$L)) with check (private.has_page_manage(%2$L))',
      table_name, permission_key
    );
    execute format(
      'create policy "Page managers delete %1$s" on public.%1$I for delete to authenticated using (private.has_page_manage(%2$L))',
      table_name, permission_key
    );
  end loop;
end;
$$;

-- SECURITY DEFINER functions bypass table RLS, so keep the original function
-- private and expose a permission-checked wrapper with the original signature.
alter function public.reconcile_payment_settlement(uuid[], text, date, numeric)
  rename to reconcile_payment_settlement_permission_impl;
revoke all on function public.reconcile_payment_settlement_permission_impl(uuid[], text, date, numeric)
  from public, anon, authenticated;

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
  if v_channel_id is null or v_payment_method_id is null then
    raise exception 'every payment must have a channel and payment method';
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

create function public.reconcile_payment_settlement(
  p_payment_ids uuid[], p_payout_date_mode text, p_payout_at date, p_charges numeric
)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_result uuid;
begin
  if not private.has_page_manage('orders.payments') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  v_result := public.reconcile_payment_settlement_permission_impl(
    p_payment_ids, p_payout_date_mode, p_payout_at, p_charges
  );
  return v_result;
end;
$$;

alter function public.update_payment_settlement(uuid, text, text, date, numeric, uuid[], boolean)
  rename to update_payment_settlement_permission_impl;
alter function public.assign_payment_settlement_invoice(uuid[], text)
  rename to assign_payment_settlement_invoice_permission_impl;
alter function public.delete_payment_settlement(uuid)
  rename to delete_payment_settlement_permission_impl;

revoke all on function public.update_payment_settlement_permission_impl(uuid, text, text, date, numeric, uuid[], boolean) from public, anon, authenticated;
revoke all on function public.assign_payment_settlement_invoice_permission_impl(uuid[], text) from public, anon, authenticated;
revoke all on function public.delete_payment_settlement_permission_impl(uuid) from public, anon, authenticated;

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

create or replace function public.assign_payment_settlement_invoice_permission_impl(
  p_settlement_ids uuid[],
  p_invoice_number text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(array_length(p_settlement_ids, 1), 0) = 0
    or nullif(trim(p_invoice_number), '') is null
  then
    raise exception 'invoice number and settlements are required';
  end if;
  update public.payment_settlements
  set invoice_number = trim(p_invoice_number)
  where id = any(p_settlement_ids);
  if not found then
    raise exception 'settlements not found';
  end if;
end;
$$;

create or replace function public.delete_payment_settlement_permission_impl(
  p_settlement_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_settlement_id is null then
    raise exception 'settlement id is required';
  end if;
  if not exists (
    select 1 from public.payment_settlements where id = p_settlement_id
  ) then
    raise exception 'settlement not found';
  end if;
  if exists (
    select 1
    from public.payment_settlements settlement
    where settlement.id = p_settlement_id
      and exists (
        select 1
        from public.payment_settlement_payments relation
        where relation.payment_settlement_id = settlement.id
      )
      and not exists (
        select 1
        from public.payment_settlement_payments relation
        left join public.payments payment on payment.id = relation.payment_id
        where relation.payment_settlement_id = settlement.id
          and payment.order_id is null
      )
      and abs(coalesce(settlement.gross_amount, 0) - coalesce((
        select sum(payment.amount)
        from public.payment_settlement_payments relation
        join public.payments payment on payment.id = relation.payment_id
        where relation.payment_settlement_id = settlement.id
      ), 0)) < 0.01
  ) then
    raise exception 'settlement with verified order links cannot be deleted';
  end if;

  delete from public.payment_settlement_payments
  where payment_settlement_id = p_settlement_id;
  delete from public.payment_settlements
  where id = p_settlement_id;
end;
$$;

create function public.update_payment_settlement(
  p_settlement_id uuid,
  p_invoice_number text,
  p_receipt_number text,
  p_payout_at date,
  p_charges numeric,
  p_payment_ids uuid[],
  p_preserve_payment_amount boolean default false
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not private.has_page_manage('orders.payments') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  perform public.update_payment_settlement_permission_impl(
    p_settlement_id, p_invoice_number, p_receipt_number, p_payout_at,
    p_charges, p_payment_ids, p_preserve_payment_amount
  );
end;
$$;

create function public.assign_payment_settlement_invoice(
  p_settlement_ids uuid[], p_invoice_number text
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not private.has_page_manage('orders.payments') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  perform public.assign_payment_settlement_invoice_permission_impl(
    p_settlement_ids, p_invoice_number
  );
end;
$$;

create function public.delete_payment_settlement(p_settlement_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not private.has_page_manage('orders.payments') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  perform public.delete_payment_settlement_permission_impl(p_settlement_id);
end;
$$;

alter function public.delete_meat_delivery_note(uuid)
  rename to delete_meat_delivery_note_permission_impl;
revoke all on function public.delete_meat_delivery_note_permission_impl(uuid)
  from public, anon, authenticated;

create function public.delete_meat_delivery_note(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not private.has_page_manage('frozen.delivery_notes') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  return public.delete_meat_delivery_note_permission_impl(p_order_id);
end;
$$;

alter function public.create_prepared_meat_item(text, text, text, text, numeric, uuid)
  rename to create_prepared_meat_item_permission_impl;
alter function public.update_prepared_meat_item_flags(uuid, boolean)
  rename to update_prepared_meat_item_flags_permission_impl;
alter function public.create_prepared_meat_inbound_with_raw(uuid, date, numeric, text, jsonb)
  rename to create_prepared_meat_inbound_with_raw_permission_impl;
alter function public.create_prepared_meat_inbound_no_raw(date, jsonb)
  rename to create_prepared_meat_inbound_no_raw_permission_impl;
alter function public.create_prepared_meat_outbound(uuid, uuid, text, date, text, jsonb)
  rename to create_prepared_meat_outbound_permission_impl;
alter function public.update_prepared_meat_inbound_quantity(uuid, numeric)
  rename to update_prepared_meat_inbound_quantity_permission_impl;

revoke all on function public.create_prepared_meat_item_permission_impl(text, text, text, text, numeric, uuid) from public, anon, authenticated;
revoke all on function public.update_prepared_meat_item_flags_permission_impl(uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_prepared_meat_inbound_with_raw_permission_impl(uuid, date, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_prepared_meat_inbound_no_raw_permission_impl(date, jsonb) from public, anon, authenticated;
revoke all on function public.create_prepared_meat_outbound_permission_impl(uuid, uuid, text, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_prepared_meat_inbound_quantity_permission_impl(uuid, numeric) from public, anon, authenticated;

create function public.create_prepared_meat_item(p_name text, p_english_name text, p_sku text, p_unit text, p_kg_per_package numeric, p_raw_meat_item_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_page_manage('frozen.prepared_meat_inventory') then raise exception 'insufficient_privilege' using errcode = '42501'; end if;
  return public.create_prepared_meat_item_permission_impl(p_name, p_english_name, p_sku, p_unit, p_kg_per_package, p_raw_meat_item_id);
end; $$;

create function public.update_prepared_meat_item_flags(p_item_id uuid, p_is_active boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_page_manage('frozen.prepared_meat_inventory') then raise exception 'insufficient_privilege' using errcode = '42501'; end if;
  perform public.update_prepared_meat_item_flags_permission_impl(p_item_id, p_is_active);
end; $$;

create function public.create_prepared_meat_inbound_with_raw(p_raw_meat_item_id uuid, p_movement_date date, p_outbound_kg numeric, p_remarks text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_page_manage('frozen.prepared_meat_inventory') then raise exception 'insufficient_privilege' using errcode = '42501'; end if;
  return public.create_prepared_meat_inbound_with_raw_permission_impl(p_raw_meat_item_id, p_movement_date, p_outbound_kg, p_remarks, p_lines);
end; $$;

create function public.create_prepared_meat_inbound_no_raw(p_movement_date date, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_page_manage('frozen.prepared_meat_inventory') then raise exception 'insufficient_privilege' using errcode = '42501'; end if;
  return public.create_prepared_meat_inbound_no_raw_permission_impl(p_movement_date, p_lines);
end; $$;

create function public.create_prepared_meat_outbound(p_customer_id uuid, p_shipping_method_id uuid, p_order_number text, p_shipping_date date, p_remarks text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_page_manage('frozen.prepared_meat_inventory') then raise exception 'insufficient_privilege' using errcode = '42501'; end if;
  return public.create_prepared_meat_outbound_permission_impl(p_customer_id, p_shipping_method_id, p_order_number, p_shipping_date, p_remarks, p_lines);
end; $$;

create function public.update_prepared_meat_inbound_quantity(p_movement_id uuid, p_quantity numeric)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_page_manage('frozen.prepared_meat_inventory') then raise exception 'insufficient_privilege' using errcode = '42501'; end if;
  return public.update_prepared_meat_inbound_quantity_permission_impl(p_movement_id, p_quantity);
end; $$;

grant execute on function public.reconcile_payment_settlement(uuid[], text, date, numeric) to authenticated;
grant execute on function public.update_payment_settlement(uuid, text, text, date, numeric, uuid[], boolean) to authenticated;
grant execute on function public.assign_payment_settlement_invoice(uuid[], text) to authenticated;
grant execute on function public.delete_payment_settlement(uuid) to authenticated;
grant execute on function public.delete_meat_delivery_note(uuid) to authenticated;
grant execute on function public.create_prepared_meat_item(text, text, text, text, numeric, uuid) to authenticated;
grant execute on function public.update_prepared_meat_item_flags(uuid, boolean) to authenticated;
grant execute on function public.create_prepared_meat_inbound_with_raw(uuid, date, numeric, text, jsonb) to authenticated;
grant execute on function public.create_prepared_meat_inbound_no_raw(date, jsonb) to authenticated;
grant execute on function public.create_prepared_meat_outbound(uuid, uuid, text, date, text, jsonb) to authenticated;
grant execute on function public.update_prepared_meat_inbound_quantity(uuid, numeric) to authenticated;

revoke all on function public.reconcile_payment_settlement(uuid[], text, date, numeric) from public, anon;
revoke all on function public.update_payment_settlement(uuid, text, text, date, numeric, uuid[], boolean) from public, anon;
revoke all on function public.assign_payment_settlement_invoice(uuid[], text) from public, anon;
revoke all on function public.delete_payment_settlement(uuid) from public, anon;
revoke all on function public.delete_meat_delivery_note(uuid) from public, anon;
revoke all on function public.create_prepared_meat_item(text, text, text, text, numeric, uuid) from public, anon;
revoke all on function public.update_prepared_meat_item_flags(uuid, boolean) from public, anon;
revoke all on function public.create_prepared_meat_inbound_with_raw(uuid, date, numeric, text, jsonb) from public, anon;
revoke all on function public.create_prepared_meat_inbound_no_raw(date, jsonb) from public, anon;
revoke all on function public.create_prepared_meat_outbound(uuid, uuid, text, date, text, jsonb) from public, anon;
revoke all on function public.update_prepared_meat_inbound_quantity(uuid, numeric) from public, anon;
