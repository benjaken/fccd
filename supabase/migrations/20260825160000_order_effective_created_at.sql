alter table public.orders
  add column if not exists effective_created_at timestamptz
  generated always as (coalesce(bubble_created_at, created_at)) stored;

create index if not exists idx_orders_quote_effective_created_at
  on public.orders (effective_created_at desc, id)
  where document_type = 'quote' and archived_at is null;
