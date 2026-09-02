-- Replace the single famous-brand checkbox value with selectable customer-tag ids.
-- Keep the legacy boolean column for existing filters and historical data.
alter table public.orders
  add column if not exists famous_brand_tag_ids uuid[] not null default '{}';

create index if not exists orders_famous_brand_tag_ids_gin_idx
  on public.orders using gin (famous_brand_tag_ids);

comment on column public.orders.famous_brand_tag_ids is
  'Active customer tag ids selected in the order/quote editor for famous-brand customers.';

-- Existing quote-to-order conversion RPCs copy the whole quote row manually. A
-- trigger keeps this new PDF/editor metadata when an order is created from a
-- quote, including conversions performed by older deployed RPC definitions.
create or replace function public.copy_famous_brand_tag_ids_from_quote()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.document_type = 'order'
     and new.source_quote_id is not null
     and coalesce(new.famous_brand_tag_ids, '{}') = '{}'::uuid[] then
    select coalesce(source.famous_brand_tag_ids, '{}')
      into new.famous_brand_tag_ids
    from public.orders as source
    where source.id = new.source_quote_id;
  end if;
  return new;
end;
$$;

drop trigger if exists copy_famous_brand_tag_ids_from_quote on public.orders;
create trigger copy_famous_brand_tag_ids_from_quote
before insert on public.orders
for each row execute function public.copy_famous_brand_tag_ids_from_quote();
