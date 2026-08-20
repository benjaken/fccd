create or replace function public.delete_payment_settlement(
  p_settlement_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((auth.jwt()->'app_metadata'->>'role'), '') not in ('Super Admin', 'Admin') then
    raise exception 'administrator access required';
  end if;

  if p_settlement_id is null then
    raise exception 'settlement id is required';
  end if;

  if not exists (select 1 from public.payment_settlements where id = p_settlement_id) then
    raise exception 'settlement not found';
  end if;

  delete from public.payment_settlement_payments
  where payment_settlement_id = p_settlement_id;

  delete from public.payment_settlements
  where id = p_settlement_id;
end;
$$;

revoke all on function public.delete_payment_settlement(uuid) from public;
grant execute on function public.delete_payment_settlement(uuid) to authenticated;
