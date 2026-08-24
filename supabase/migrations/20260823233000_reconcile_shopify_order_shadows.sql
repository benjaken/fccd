alter table public.orders
  add column if not exists merged_into_order_id uuid
    references public.orders (id);

create index if not exists orders_merged_into_order_id_idx
  on public.orders (merged_into_order_id)
  where merged_into_order_id is not null;

comment on column public.orders.merged_into_order_id is
  'Canonical operational order when this row is an archived duplicate imported from another source.';

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

  if not found or v_shadow.id is null then
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

  if v_canonical.is_sent_to_factory is distinct from true
    and not exists (
      select 1 from public.deliveries where order_id = p_canonical_order_id
    )
  then
    raise exception 'shopify_order_reconcile_not_operational' using errcode = '22023';
  end if;

  -- Preserve both audit trails but void Shopify receipts already represented
  -- by a same-day manual receipt on the canonical order.
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

  -- Keep any genuinely additional Shopify receipt by moving it to the
  -- operational order before archiving the shadow.
  update public.payments
  set order_id = p_canonical_order_id,
      order_legacy_id = v_canonical.legacy_id,
      order_number_snapshot = v_canonical.order_number
  where order_id = p_shadow_order_id
    and voided_at is null;

  -- Release the unique Shopify identity first, then attach it to the
  -- operational record in the same transaction.
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

revoke all on function public.reconcile_shopify_order_shadow(uuid, uuid) from public;
grant execute on function public.reconcile_shopify_order_shadow(uuid, uuid) to service_role;

comment on function public.reconcile_shopify_order_shadow(uuid, uuid) is
  'Transactionally links a late Bubble operational order to an earlier Shopify shadow while preserving audit history.';

-- Repair the confirmed B-1546 split. The function is idempotent, validates
-- order number, amount, customer identity and operational evidence, and keeps
-- the Shopify row as an archived alias instead of deleting it.
select public.reconcile_shopify_order_shadow(
  '65a6f12a-2974-4f06-92c1-2106cdd3fd0d'::uuid,
  '778be1dc-8ebb-495d-823d-f8a404527493'::uuid
);
