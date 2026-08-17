-- Delivery list: order shipping method, delivery time window, and surcharge labels.

alter table public.orders
  add column if not exists shipping_method_id uuid
    references public.shipping_methods (id),
  add column if not exists shipping_method_legacy_id text;

create index if not exists orders_shipping_method_id_idx
  on public.orders (shipping_method_id);

comment on column public.orders.shipping_method_id is
  'Normalized Bubble A_Order Delivery_DS_Shipping Method.';

alter table public.deliveries
  add column if not exists delivery_time text;

comment on column public.deliveries.delivery_time is
  'Bubble B_delivery schedule Delivery Time_A_order window, e.g. 18:00 - 19:00.';

update public.deliveries as delivery
set shipping_method_id = orders.shipping_method_id
from public.orders
where delivery.order_id = orders.id
  and delivery.shipping_method_id is null
  and orders.shipping_method_id is not null;

drop policy if exists "Operations read delivery surcharges" on public.delivery_surcharges;

create policy "Operations read delivery surcharges"
on public.delivery_surcharges
for select
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting', 'Factory')
);
