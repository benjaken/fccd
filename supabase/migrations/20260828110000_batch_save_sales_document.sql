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
      as item(id uuid, quantity numeric, unit_price numeric, remarks text)
    left join public.order_lines line
      on line.id = item.id and line.order_id = p_order_id and not line.is_void
    where line.id is null
      or item.quantity is null
      or item.quantity < 0
      or item.quantity <> trunc(item.quantity)
      or item.unit_price is null
      or item.unit_price < 0
  ) then
    raise exception 'invalid_order_line' using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
      as item(id uuid, quantity numeric, unit_price numeric, remarks text)
  ) <> (
    select count(distinct item.id)
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
      as item(id uuid, quantity numeric, unit_price numeric, remarks text)
  ) then
    raise exception 'duplicate_order_line' using errcode = '22023';
  end if;

  update public.order_lines line
  set quantity = item.quantity,
      unit_price = item.unit_price,
      total_price = round(item.quantity * item.unit_price, 2),
      remarks_1 = nullif(btrim(item.remarks), ''),
      updated_at = now()
  from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
    as item(id uuid, quantity numeric, unit_price numeric, remarks text)
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

revoke all on function public.save_sales_document_batch(
  uuid, text, jsonb, numeric, numeric, numeric, numeric,
  jsonb, uuid, text, jsonb
) from public, anon;

grant execute on function public.save_sales_document_batch(
  uuid, text, jsonb, numeric, numeric, numeric, numeric,
  jsonb, uuid, text, jsonb
) to authenticated;
