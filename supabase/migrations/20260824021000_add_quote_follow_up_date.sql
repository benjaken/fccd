alter table public.orders
  add column if not exists quote_follow_up_date date;

create index if not exists orders_open_quote_follow_up_date_idx
  on public.orders (quote_follow_up_date, created_at desc)
  where document_type = 'quote'
    and archived_at is null
    and (quote_status is null or quote_status not in ('Done Deal', 'Case Closed'));

comment on column public.orders.quote_follow_up_date is
  'Hong Kong calendar date on which an open quote should be followed up.';
