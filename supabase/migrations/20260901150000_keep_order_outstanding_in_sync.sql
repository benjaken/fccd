-- Keep the unpaid-order queues aligned with the canonical active payments.
-- Payment imports (especially Shopify transactions) can arrive after the order
-- status update, so this invariant must live in the database rather than only
-- in the order editor.

create or replace function private.order_outstanding_from_payments(
  p_order_id uuid,
  p_grand_total numeric,
  p_payment_status_source text,
  p_shopify_financial_status text
)
returns numeric
language sql
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_payment_status_source = 'shopify'
      and lower(coalesce(p_shopify_financial_status, '')) in (
        'paid',
        'partially_refunded',
        'refunded',
        'voided'
      )
      then 0
    else greatest(
      coalesce(p_grand_total, 0) - coalesce((
        select sum(payments.amount)
        from public.payments as payments
        where payments.order_id = p_order_id
          and payments.voided_at is null
      ), 0),
      0
    )
  end;
$$;

create or replace function private.recalculate_order_outstanding(
  p_order_id uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.orders as orders
  set outstanding = private.order_outstanding_from_payments(
        orders.id,
        orders.grand_total,
        orders.payment_status_source,
        orders.shopify_financial_status
      ),
      updated_at = now()
  where orders.id = p_order_id
    and orders.document_type = 'order';
$$;

create or replace function private.sync_order_outstanding_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform private.recalculate_order_outstanding(old.order_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform private.recalculate_order_outstanding(old.order_id);
  end if;

  perform private.recalculate_order_outstanding(new.order_id);
  return new;
end;
$$;

drop trigger if exists sync_order_outstanding_after_payment
  on public.payments;
create trigger sync_order_outstanding_after_payment
after insert or delete or update of order_id, amount, voided_at
on public.payments
for each row execute function private.sync_order_outstanding_after_payment();

-- Shopify refreshes also write their latest balance to orders. When active
-- payment rows already exist, keep the payment ledger authoritative so a late
-- or out-of-order status refresh cannot put a paid order back in the queue.
create or replace function private.guard_order_outstanding_from_payments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_calculated numeric;
begin
  if new.document_type <> 'order' then
    return new;
  end if;

  v_calculated := private.order_outstanding_from_payments(
    new.id,
    new.grand_total,
    new.payment_status_source,
    new.shopify_financial_status
  );

  -- A source-owned balance may already be lower than the locally available
  -- payment ledger (for example, an old migration with partial transactions).
  -- Never increase that balance during an unrelated order refresh.
  if new.outstanding is null or new.outstanding > v_calculated then
    new.outstanding := v_calculated;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_order_outstanding_from_payments
  on public.orders;
create trigger guard_order_outstanding_from_payments
before update of grand_total, outstanding, document_type
on public.orders
for each row execute function private.guard_order_outstanding_from_payments();

-- Repair only overstated balances. Historical payment imports are not always
-- complete, so this backfill must never turn a source-confirmed zero balance
-- into new debt.
update public.orders as orders
set outstanding = private.order_outstanding_from_payments(
      orders.id,
      orders.grand_total,
      orders.payment_status_source,
      orders.shopify_financial_status
    ),
    updated_at = now()
where orders.document_type = 'order'
  and orders.outstanding > private.order_outstanding_from_payments(
    orders.id,
    orders.grand_total,
    orders.payment_status_source,
    orders.shopify_financial_status
  );
