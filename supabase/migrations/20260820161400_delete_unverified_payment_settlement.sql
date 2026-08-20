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

  if exists (
    select 1
    from public.payment_settlements ps
    where ps.id = p_settlement_id
      and exists (select 1 from public.payment_settlement_payments sp where sp.payment_settlement_id = ps.id)
      and not exists (
        select 1
        from public.payment_settlement_payments sp
        left join public.payments p on p.id = sp.payment_id
        where sp.payment_settlement_id = ps.id
          and p.order_id is null
      )
      and abs(coalesce(ps.gross_amount, 0) - coalesce((
        select sum(p.amount)
        from public.payment_settlement_payments sp
        join public.payments p on p.id = sp.payment_id
        where sp.payment_settlement_id = ps.id
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
