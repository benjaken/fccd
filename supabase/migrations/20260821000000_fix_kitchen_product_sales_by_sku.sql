-- Keep single-product sales separate from package sales and aggregate
-- duplicate catalog records by SKU.

create or replace function public.report_kitchen_product_sales(
  p_start_date date,
  p_end_date date,
  p_brand_id uuid default null,
  p_product_type_name text default null,
  p_collection_id uuid default null
)
returns table (
  product_id uuid,
  sku text,
  product_name text,
  brand_name text,
  category_name text,
  product_set_name text,
  quantity numeric,
  total_amount numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with product_catalog as (
    select
      coalesce(nullif(btrim(p.sku), ''), p.id::text) as product_key,
      (array_agg(
        p.id
        order by p.updated_at desc nulls last, p.created_at desc nulls last, p.id
      ))[1] as product_id,
      max(nullif(btrim(p.sku), '')) as sku,
      (array_agg(
        coalesce(nullif(btrim(p.chinese_name), ''), p.name)
        order by p.updated_at desc nulls last, p.created_at desc nulls last, p.id
      ))[1] as product_name,
      coalesce(nullif(btrim(ch.name), ''), '未分類品牌') as brand_name,
      coalesce(nullif(btrim(pt.name), ''), '未分類') as category_name,
      string_agg(
        distinct nullif(btrim(pc.name), ''),
        ', ' order by nullif(btrim(pc.name), '')
      ) as product_set_name
    from public.products p
    left join public.channels ch on ch.id = p.channel_id
    left join public.product_types pt on pt.id = p.product_type_id
    left join public.product_collection_links pcl on pcl.product_id = p.id
    left join public.product_collections pc on pc.id = pcl.collection_id
    where p.archived_at is null
      and (p_brand_id is null or p.channel_id = p_brand_id)
      and (p_product_type_name is null or btrim(pt.name) = p_product_type_name)
      and (
        p_collection_id is null
        or exists (
          select 1
          from public.product_collection_links selected_collection
          where selected_collection.product_id = p.id
            and selected_collection.collection_id = p_collection_id
        )
      )
    group by
      coalesce(nullif(btrim(p.sku), ''), p.id::text),
      ch.name,
      pt.name
  )
  select
    catalog.product_id,
    catalog.sku,
    catalog.product_name,
    catalog.brand_name,
    catalog.category_name,
    coalesce(catalog.product_set_name, '未分類產品集') as product_set_name,
    sum(coalesce(line.quantity, 0))::numeric as quantity,
    sum(
      coalesce(
        line.total_price,
        coalesce(line.unit_price, 0) * coalesce(line.quantity, 0)
      )
    )::numeric as total_amount
  from product_catalog catalog
  join public.products line_product
    on coalesce(nullif(btrim(line_product.sku), ''), line_product.id::text) = catalog.product_key
   and line_product.archived_at is null
  join public.order_lines line on line.product_id = line_product.id
  join public.orders order_header on order_header.id = line.order_id
  where order_header.document_type = 'order'
    and order_header.archived_at is null
    and line.is_void = false
    and line.package_id is null
    and order_header.delivery_at >=
      (p_start_date::timestamp at time zone 'Asia/Hong_Kong')
    and order_header.delivery_at <
      ((p_end_date + 1)::timestamp at time zone 'Asia/Hong_Kong')
  group by
    catalog.product_key,
    catalog.product_id,
    catalog.sku,
    catalog.product_name,
    catalog.brand_name,
    catalog.category_name,
    catalog.product_set_name
  having sum(coalesce(line.quantity, 0)) <> 0
  order by quantity desc, catalog.product_name asc;
$$;

revoke all on function public.report_kitchen_product_sales(date, date, uuid, text, uuid)
from public, anon;
grant execute on function public.report_kitchen_product_sales(date, date, uuid, text, uuid)
to authenticated, service_role;

comment on function public.report_kitchen_product_sales(date, date, uuid, text, uuid) is
  'Aggregates single-product sales by SKU, brand, category and product collection for a Hong Kong delivery date range.';
