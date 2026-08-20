alter table public.payment_settlements
  add column if not exists invoice_number text,
  add column if not exists receipt_number text;

create index if not exists payment_settlements_payout_at_idx
  on public.payment_settlements (payout_at desc nulls last);
