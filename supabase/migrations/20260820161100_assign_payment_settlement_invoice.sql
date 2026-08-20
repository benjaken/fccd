create or replace function public.assign_payment_settlement_invoice(
  p_settlement_ids uuid[],
  p_invoice_number text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((auth.jwt()->'app_metadata'->>'role'), '') not in ('Super Admin', 'Admin') then
    raise exception 'administrator access required';
  end if;
  if coalesce(array_length(p_settlement_ids, 1), 0) = 0 or nullif(trim(p_invoice_number), '') is null then
    raise exception 'invoice number and settlements are required';
  end if;
  update public.payment_settlements
  set invoice_number = trim(p_invoice_number)
  where id = any(p_settlement_ids);
  if not found then raise exception 'settlements not found'; end if;
end;
$$;

revoke all on function public.assign_payment_settlement_invoice(uuid[], text) from public;
grant execute on function public.assign_payment_settlement_invoice(uuid[], text) to authenticated;
