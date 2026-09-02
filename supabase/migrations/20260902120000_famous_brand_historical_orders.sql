comment on column public.orders.is_hong_kong_famous_brand is
  'Marks an order or quote customer as a well-known Hong Kong brand.';

-- Carry the customer classification from marked quotes into historical orders
-- with the same company name. Orders without a company name are deliberately
-- excluded because the order UI does not expose the classification for them.
with famous_company_names as (
  select distinct lower(regexp_replace(trim(company_name_snapshot), '\s+', ' ', 'g')) as company_name
  from public.orders
  where document_type = 'quote'
    and is_hong_kong_famous_brand = true
    and nullif(trim(company_name_snapshot), '') is not null
)
update public.orders as historical_order
set is_hong_kong_famous_brand = true,
    updated_at = now()
from famous_company_names
where historical_order.document_type = 'order'
  and nullif(trim(historical_order.company_name_snapshot), '') is not null
  and lower(regexp_replace(trim(historical_order.company_name_snapshot), '\s+', ' ', 'g')) = famous_company_names.company_name;

create index if not exists orders_hk_famous_brand_orders_idx
  on public.orders (updated_at desc)
  where document_type = 'order'
    and archived_at is null
    and is_hong_kong_famous_brand = true
    and company_name_snapshot is not null;
