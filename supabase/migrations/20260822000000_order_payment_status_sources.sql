-- Shopify-linked orders receive their operational payment status from
-- Shopify. Orders without a Shopify link keep the existing manual payment and
-- reconciliation workflow.

alter table public.orders
  add column if not exists payment_status_source text not null default 'manual',
  add column if not exists shopify_financial_status text,
  add column if not exists shopify_financial_status_synced_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_status_source_check;

alter table public.orders
  add constraint orders_payment_status_source_check
  check (payment_status_source = any (array['manual'::text, 'shopify'::text]));

update public.orders
set payment_status_source = 'shopify'
where shopify_order_id is not null
  and payment_status_source <> 'shopify';

create index if not exists orders_payment_status_source_idx
  on public.orders (payment_status_source);

comment on column public.orders.payment_status_source is
  'manual for locally reconciled orders; shopify after a confirmed Shopify link';

comment on column public.orders.shopify_financial_status is
  'Latest normalized Shopify financial_status for a linked order';
