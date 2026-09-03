-- Office edits can lower the receivable after a customer has already paid.
-- Keep the payment ledger intact and store a negative outstanding so the UI
-- can show the overpayment instead of clamping the balance at zero.
-- Shopify-settled orders still never create new debt from an incomplete
-- payment import, but they can now surface local overpayments.

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
      then least(
        0,
        coalesce(p_grand_total, 0) - coalesce((
          select sum(payments.amount)
          from public.payments as payments
          where payments.order_id = p_order_id
            and payments.voided_at is null
        ), 0)
      )
    else
      coalesce(p_grand_total, 0) - coalesce((
        select sum(payments.amount)
        from public.payments as payments
        where payments.order_id = p_order_id
          and payments.voided_at is null
      ), 0)
  end;
$$;

create or replace function private.recalculate_quote_total(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders o
  set grand_total = greatest(
        coalesce((
          select sum(l.total_price)
          from public.order_lines l
          where l.order_id = p_order_id and not l.is_void
        ), 0)
        + coalesce((
          select sum(event.price_snapshot)
          from public.order_bento_event_parts event
          where event.order_id = p_order_id
        ), 0)
        + coalesce(o.shipping_fee, 0)
        - coalesce(o.discount_amount, 0)
        - coalesce(o.cashdollar_redeemed, 0),
        0
      ),
      outstanding = greatest(
        coalesce((
          select sum(l.total_price)
          from public.order_lines l
          where l.order_id = p_order_id and not l.is_void
        ), 0)
        + coalesce((
          select sum(event.price_snapshot)
          from public.order_bento_event_parts event
          where event.order_id = p_order_id
        ), 0)
        + coalesce(o.shipping_fee, 0)
        - coalesce(o.discount_amount, 0)
        - coalesce(o.cashdollar_redeemed, 0),
        0
      ) - case
            when o.document_type = 'order' then coalesce((
              select sum(p.amount)
              from public.payments p
              where p.order_id = p_order_id and p.voided_at is null
            ), 0)
            else 0
          end,
      updated_at = now()
  where o.id = p_order_id
    and o.document_type in ('quote', 'unconfirmed', 'order');
$$;

-- Repair overstated (including zero-clamped) balances after order edits.
update public.orders as orders
set outstanding = private.order_outstanding_from_payments(
      orders.id,
      orders.grand_total,
      orders.payment_status_source,
      orders.shopify_financial_status
    ),
    updated_at = now()
where orders.document_type = 'order'
  and orders.outstanding is distinct from private.order_outstanding_from_payments(
    orders.id,
    orders.grand_total,
    orders.payment_status_source,
    orders.shopify_financial_status
  )
  and orders.outstanding > private.order_outstanding_from_payments(
    orders.id,
    orders.grand_total,
    orders.payment_status_source,
    orders.shopify_financial_status
  );
