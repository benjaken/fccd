create or replace function public.update_payment_settlement(
  p_settlement_id uuid,
  p_invoice_number text,
  p_receipt_number text,
  p_payout_at date,
  p_charges numeric,
  p_payment_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
  v_payment_method_id uuid;
  v_gross_amount numeric(14,2);
begin
  if coalesce((auth.jwt()->'app_metadata'->>'role'), '') not in ('Super Admin', 'Admin') then
    raise exception 'administrator access required';
  end if;
  if p_settlement_id is null or p_payout_at is null or coalesce(array_length(p_payment_ids, 1), 0) = 0 or coalesce(p_charges, 0) < 0 then
    raise exception 'invalid settlement details';
  end if;
  select channel_id, payment_method_id into v_channel_id, v_payment_method_id
  from public.payment_settlements where id = p_settlement_id for update;
  if not found then raise exception 'settlement not found'; end if;
  if exists (
    select 1 from public.payments p where p.id = any(p_payment_ids) and
      (p.voided_at is not null or p.channel_id is distinct from v_channel_id or p.payment_method_id is distinct from v_payment_method_id)
  ) then raise exception 'payments must match the settlement channel and payment method'; end if;
  if exists (
    select 1 from public.payment_settlement_payments sp where sp.payment_id = any(p_payment_ids) and sp.payment_settlement_id <> p_settlement_id
  ) then raise exception 'a payment is already reconciled elsewhere'; end if;
  select coalesce(sum(amount), 0) into v_gross_amount from public.payments where id = any(p_payment_ids);
  if v_gross_amount - p_charges < 0 then raise exception 'net amount cannot be negative'; end if;
  delete from public.payment_settlement_payments where payment_settlement_id = p_settlement_id;
  insert into public.payment_settlement_payments (payment_settlement_id, payment_id, payment_settlement_legacy_id, payment_legacy_id)
  select p_settlement_id, p.id, ps.legacy_id, p.legacy_id from public.payments p cross join public.payment_settlements ps where ps.id = p_settlement_id and p.id = any(p_payment_ids);
  update public.payment_settlements set invoice_number = nullif(trim(p_invoice_number), ''), receipt_number = nullif(trim(p_receipt_number), ''), payout_at = p_payout_at::timestamp at time zone 'Asia/Hong_Kong', gross_amount = v_gross_amount, charges = p_charges, net_amount = v_gross_amount - p_charges where id = p_settlement_id;
  update public.payments set payout_at = p_payout_at::timestamp at time zone 'Asia/Hong_Kong', updated_at = now() where id = any(p_payment_ids);
end;
$$;

revoke all on function public.update_payment_settlement(uuid, text, text, date, numeric, uuid[]) from public;
grant execute on function public.update_payment_settlement(uuid, text, text, date, numeric, uuid[]) to authenticated;
