-- Atomically create a settlement, relate every selected payment, and set its
-- payout date.  The relation is the source of truth for reconciliation.
create or replace function public.reconcile_payment_settlement(
  p_payment_ids uuid[],
  p_payout_date_mode text,
  p_payout_at date,
  p_charges numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  v_payment_count integer;
  v_channel_id uuid;
  v_channel_legacy_id text;
  v_payment_method_id uuid;
  v_payment_method_legacy_id text;
  v_gross_amount numeric(14, 2);
  v_settlement_id uuid := gen_random_uuid();
begin
  if v_role not in ('Super Admin', 'Admin') then
    raise exception 'payment settlement write is not permitted';
  end if;
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
    select p.*
    from public.payments p
    where p.id = any(p_payment_ids)
      and p.voided_at is null
    for update
  ),
  selected_payments as (
    select p.*
    from locked_payments p
    where not exists (
      select 1
      from public.payment_settlement_payments sp
      where sp.payment_id = p.id
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
    from public.payments p
    where p.id = any(p_payment_ids)
      and (p.channel_id is distinct from v_channel_id
        or p.payment_method_id is distinct from v_payment_method_id)
  ) then
    raise exception 'payments must share one channel and payment method';
  end if;
  if v_gross_amount - coalesce(p_charges, 0) < 0 then
    raise exception 'net amount cannot be negative';
  end if;

  insert into public.payment_settlements (
    id, legacy_id, channel_id, channel_legacy_id, payment_method_id,
    payment_method_legacy_id, payout_at, gross_amount, charges, net_amount
  ) values (
    v_settlement_id, 'manual-reconciliation:' || v_settlement_id::text,
    v_channel_id, v_channel_legacy_id, v_payment_method_id,
    v_payment_method_legacy_id,
    case when p_payout_date_mode = 'custom' then p_payout_at::timestamp at time zone 'Asia/Hong_Kong' else null end,
    v_gross_amount, coalesce(p_charges, 0), v_gross_amount - coalesce(p_charges, 0)
  );

  insert into public.payment_settlement_payments (
    payment_settlement_id, payment_id, payment_settlement_legacy_id, payment_legacy_id
  )
  select
    v_settlement_id, p.id, 'manual-reconciliation:' || v_settlement_id::text, p.legacy_id
  from public.payments p
  where p.id = any(p_payment_ids);

  update public.payments
  set payout_at = case
    when p_payout_date_mode = 'custom' then p_payout_at::timestamp at time zone 'Asia/Hong_Kong'
    else payment_at
  end,
  updated_at = now()
  where id = any(p_payment_ids);

  return v_settlement_id;
end;
$$;

revoke all on function public.reconcile_payment_settlement(uuid[], text, date, numeric) from public;
grant execute on function public.reconcile_payment_settlement(uuid[], text, date, numeric) to authenticated;
