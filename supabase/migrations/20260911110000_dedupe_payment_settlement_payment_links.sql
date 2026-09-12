-- Bubble sometimes creates a second s_paymentreport for the same S_payment
-- (often once without INV/REC, later with numbers). Incremental import kept both
-- settlement→payment links, so Masoft showed duplicate rows and
-- update_payment_settlement raised "a payment is already reconciled elsewhere".

with ranked_links as (
  select
    link.id as link_id,
    link.payment_id,
    row_number() over (
      partition by link.payment_id
      order by
        case
          when nullif(btrim(ps.invoice_number), '') is not null
            and nullif(btrim(ps.receipt_number), '') is not null then 0
          when nullif(btrim(ps.invoice_number), '') is not null
            or nullif(btrim(ps.receipt_number), '') is not null then 1
          else 2
        end,
        ps.bubble_modified_at desc nulls last,
        ps.bubble_created_at desc nulls last,
        ps.created_at desc,
        link.created_at desc,
        link.id
    ) as keep_rank
  from public.payment_settlement_payments link
  join public.payment_settlements ps on ps.id = link.payment_settlement_id
  where link.payment_id is not null
)
delete from public.payment_settlement_payments link
using ranked_links
where link.id = ranked_links.link_id
  and ranked_links.keep_rank > 1;

-- Drop Bubble settlement shells that lost every payment link after dedupe.
delete from public.payment_settlements ps
where not exists (
  select 1
  from public.payment_settlement_payments link
  where link.payment_settlement_id = ps.id
);

-- One payment may belong to only one settlement going forward.
create unique index if not exists payment_settlement_payments_payment_id_uidx
  on public.payment_settlement_payments (payment_id)
  where payment_id is not null;

create unique index if not exists payment_settlement_payments_payment_legacy_id_uidx
  on public.payment_settlement_payments (payment_legacy_id);
