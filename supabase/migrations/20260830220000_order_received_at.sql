alter table public.orders
  add column if not exists order_received_at timestamptz;

comment on column public.orders.order_received_at is
  'Business order-entry time from Bubble New_date!, falling back to the source creation time when unavailable.';

update public.orders
set order_received_at = coalesce(order_received_at, bubble_created_at, created_at)
where order_received_at is null;

create index if not exists orders_order_received_at_idx
  on public.orders (order_received_at desc)
  where archived_at is null;

create or replace function public.set_order_received_at_fallback()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.order_received_at is null then
    new.order_received_at := coalesce(new.bubble_created_at, new.created_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_order_received_at_fallback on public.orders;
create trigger orders_set_order_received_at_fallback
before insert or update of bubble_created_at, order_received_at on public.orders
for each row execute function public.set_order_received_at_fallback();
