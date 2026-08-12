-- Bubble contains five empty payment-method snapshots and eight empty terms
-- snapshots. Preserve those source records without inventing content.
alter table public.order_payment_method_snapshots
  alter column content drop not null;
alter table public.order_terms_snapshots
  alter column content drop not null;
