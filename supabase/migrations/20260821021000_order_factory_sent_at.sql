alter table public.orders
  add column if not exists factory_sent_at timestamptz;

create index if not exists orders_factory_sent_at_idx
  on public.orders (factory_sent_at)
  where is_sent_to_factory = true;

comment on column public.orders.factory_sent_at is
  'Most recent time an order was sent to the factory; cleared when factory send is cancelled.';

create or replace function public.set_order_factory_sent_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_sent_to_factory is true
    and (tg_op = 'INSERT' or old.is_sent_to_factory is distinct from true)
  then
    new.factory_sent_at := coalesce(new.factory_sent_at, now());
  elsif new.is_sent_to_factory is distinct from true then
    new.factory_sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_factory_sent_at on public.orders;
create trigger orders_set_factory_sent_at
before insert or update of is_sent_to_factory on public.orders
for each row execute function public.set_order_factory_sent_at();
