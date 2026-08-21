create table public.order_shipping_fees (
  id uuid primary key default gen_random_uuid(),
  item text not null check (btrim(item) <> ''),
  fee numeric(14, 2) not null default 0 check (fee >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index order_shipping_fees_active_created_at_idx
  on public.order_shipping_fees (created_at, id)
  where archived_at is null;

alter table public.order_shipping_fees enable row level security;

create policy "Order settings readers read shipping fees"
on public.order_shipping_fees
for select
to authenticated
using (private.has_page_access('orders.settings'));

create policy "Order settings managers insert shipping fees"
on public.order_shipping_fees
for insert
to authenticated
with check (private.has_page_manage('orders.settings'));

create policy "Order settings managers update shipping fees"
on public.order_shipping_fees
for update
to authenticated
using (private.has_page_manage('orders.settings'))
with check (private.has_page_manage('orders.settings'));

grant select, insert, update on public.order_shipping_fees to authenticated;
