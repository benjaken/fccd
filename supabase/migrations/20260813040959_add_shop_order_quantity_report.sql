create function public.report_shop_order_quantities(
  start_date date,
  end_date date,
  shop_ids uuid[] default null
)
returns table (
  order_date date,
  shop_id uuid,
  shop_name text,
  product_id uuid,
  product_name text,
  unit text,
  total_quantity numeric
)
language sql
stable
set search_path = ''
as $$
  select
    (meat_order.order_at at time zone 'Asia/Hong_Kong')::date as order_date,
    customer.id as shop_id,
    customer.name as shop_name,
    item.id as product_id,
    coalesce(item.name, '(未指定產品)') as product_name,
    item.unit,
    sum(coalesce(line.quantity, 0)) as total_quantity
  from public.meat_orders as meat_order
  join public.meat_customers as customer
    on customer.id = meat_order.meat_customer_id
  join public.meat_order_lines as line
    on line.meat_order_id = meat_order.id
  left join public.prepared_meat_items as item
    on item.id = line.prepared_meat_item_id
  where meat_order.order_at >=
      (start_date::timestamp at time zone 'Asia/Hong_Kong')
    and meat_order.order_at <
      ((end_date + 1)::timestamp at time zone 'Asia/Hong_Kong')
    and (
      shop_ids is null
      or cardinality(shop_ids) = 0
      or customer.id = any(shop_ids)
    )
  group by
    (meat_order.order_at at time zone 'Asia/Hong_Kong')::date,
    customer.id,
    customer.name,
    item.id,
    item.name,
    item.unit
  order by order_date, customer.name, item.name;
$$;

revoke all on function public.report_shop_order_quantities(date, date, uuid[])
from public, anon;
grant execute on function public.report_shop_order_quantities(date, date, uuid[])
to authenticated, service_role;

comment on function public.report_shop_order_quantities(date, date, uuid[]) is
  'Aggregates migrated meat shop order quantities by Hong Kong business date, shop and prepared-meat product. Runs as invoker so source-table RLS applies.';
