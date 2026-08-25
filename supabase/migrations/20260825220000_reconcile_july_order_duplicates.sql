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

revoke all on function public.reconcile_shopify_order_shadow(uuid, uuid) from public;
grant execute on function public.reconcile_shopify_order_shadow(uuid, uuid) to service_role;

comment on function public.reconcile_shopify_order_shadow(uuid, uuid) is
  'Links a Bubble operational order, or a strictly matched near-simultaneous Bubble order, to its archived Shopify shadow.';

select public.reconcile_shopify_order_shadow(
  '37f4071d-33de-4a35-9cb3-9716756ad231'::uuid,
  'a1d223e7-8a4f-4325-a3d0-21d82f6e81b9'::uuid
);

select public.reconcile_shopify_order_shadow(
  '8511b2bb-4bdc-4eb5-a62d-9f00927be176'::uuid,
  '9dfcd1ac-268c-45fd-876f-6e9f7c1fa119'::uuid
);

do $$
declare
  v_alias public.orders%rowtype;
  v_canonical public.orders%rowtype;
  v_alias_id uuid := '0f0047c5-186f-413b-9c77-32c4a06494a4'::uuid;
  v_canonical_id uuid := '366d84d9-9905-45b4-846d-41a5f425a620'::uuid;
  v_now timestamptz := now();
begin
  select * into v_alias from public.orders where id = v_alias_id for update;
  select * into v_canonical from public.orders where id = v_canonical_id for update;

  if v_alias.merged_into_order_id = v_canonical_id and v_alias.archived_at is not null then
    return;
  end if;

  if v_alias.id is null or v_canonical.id is null
    or v_alias.legacy_id not like 'web-quote-%'
    or v_canonical.source_system is distinct from 'bubble'
    or v_canonical.legacy_id like 'web-quote-%'
    or upper(regexp_replace(coalesce(v_alias.order_number, ''), '[^A-Z0-9]', '', 'g'))
       is distinct from
       upper(regexp_replace(coalesce(v_canonical.order_number, ''), '[^A-Z0-9]', '', 'g'))
    or (v_alias.delivery_at at time zone 'Asia/Hong_Kong')::date
       is distinct from
       (v_canonical.delivery_at at time zone 'Asia/Hong_Kong')::date
    or coalesce(v_alias.grand_total, 0) <> 0
    or coalesce(v_canonical.grand_total, 0) <= 0
    or exists (select 1 from public.order_lines where order_id = v_alias_id)
    or exists (select 1 from public.payments where order_id = v_alias_id)
  then
    raise exception 'supabase_test_order_reconcile_validation_failed' using errcode = '22023';
  end if;

  insert into public.order_tag_assignments (order_id, order_tag_id)
  select v_canonical_id, order_tag_id
  from public.order_tag_assignments
  where order_id = v_alias_id
  on conflict (order_id, order_tag_id) do nothing;

  delete from public.order_tag_assignments where order_id = v_alias_id;

  update public.deliveries
  set order_id = v_canonical_id,
      order_legacy_id = v_canonical.legacy_id,
      updated_at = v_now
  where order_id = v_alias_id;

  update public.orders
  set merged_into_order_id = v_canonical_id,
      archived_at = v_now,
      updated_at = v_now
  where id = v_alias_id;
end;
$$;
