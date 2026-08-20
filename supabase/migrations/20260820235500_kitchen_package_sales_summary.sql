-- Central-kitchen package sales summary for the product sales report.

create or replace function public.report_kitchen_package_sales(
  p_start_date date,
  p_end_date date,
  p_brand_id uuid default null,
  p_product_type_name text default null,
  p_collection_id uuid default null
)
returns table (
  package_id uuid,
  sku text,
  package_name text,
  brand_name text,
  quantity numeric,
  total_amount numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    pkg.id as package_id,
    pkg.sku,
    coalesce(nullif(btrim(pkg.chinese_name), ''), pkg.name) as package_name,
    coalesce(nullif(btrim(ch.name), ''), '未分類品牌') as brand_name,
    sum(coalesce(line.quantity, 0))::numeric as quantity,
    sum(
      coalesce(
        line.total_price,
        coalesce(line.unit_price, 0) * coalesce(line.quantity, 0)
      )
    )::numeric as total_amount
  from public.packages pkg
  left join public.channels ch on ch.id = pkg.channel_id
  join public.order_lines line on line.package_id = pkg.id
  join public.orders order_header on order_header.id = line.order_id
  where pkg.archived_at is null
    and order_header.document_type = 'order'
    and order_header.archived_at is null
    and line.is_void = false
    and order_header.delivery_at >=
      (p_start_date::timestamp at time zone 'Asia/Hong_Kong')
    and order_header.delivery_at <
      ((p_end_date + 1)::timestamp at time zone 'Asia/Hong_Kong')
    and (p_brand_id is null or pkg.channel_id = p_brand_id)
    and (
      p_product_type_name is null
      or exists (
        select 1
        from public.package_products package_product
        join public.products product on product.id = package_product.product_id
        join public.product_types product_type on product_type.id = product.product_type_id
        where package_product.package_id = pkg.id
          and btrim(product_type.name) = p_product_type_name
      )
    )
    and (
      p_collection_id is null
      or exists (
        select 1
        from public.package_products package_product
        join public.product_collection_links collection_link
          on collection_link.product_id = package_product.product_id
        where package_product.package_id = pkg.id
          and collection_link.collection_id = p_collection_id
      )
    )
  group by pkg.id, pkg.sku, pkg.chinese_name, pkg.name, ch.name
  having sum(coalesce(line.quantity, 0)) <> 0
  order by quantity desc, package_name asc;
$$;

revoke all on function public.report_kitchen_package_sales(date, date, uuid, text, uuid)
from public, anon;
grant execute on function public.report_kitchen_package_sales(date, date, uuid, text, uuid)
to authenticated, service_role;

comment on function public.report_kitchen_package_sales(date, date, uuid, text, uuid) is
  'Aggregates central-kitchen package sales for the product sales report using the same date and catalog filters.';
