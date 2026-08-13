create or replace function public.report_monthly_prepared_meat_prices(
  report_year integer,
  price_mode text default 'shop'
)
returns table (
  product_id uuid,
  product_name text,
  product_unit text,
  sort_order numeric,
  month_number integer,
  price_per_kg numeric,
  price_per_package numeric
)
language sql
stable
set search_path = ''
as $$
  with ranked_prices as (
    select
      price.raw_meat_item_id,
      extract(
        year from price.month_at at time zone 'Asia/Hong_Kong'
      )::integer as price_year,
      extract(
        month from price.month_at at time zone 'Asia/Hong_Kong'
      )::integer as price_month,
      case
        when price_mode = 'shop' then price.shop_price
        when price_mode = 'factory' then price.room_price
      end as selected_price,
      row_number() over (
        partition by
          price.raw_meat_item_id,
          date_trunc(
            'month',
            price.month_at at time zone 'Asia/Hong_Kong'
          )
        order by
          price.bubble_modified_at desc nulls last,
          price.created_at desc,
          price.id desc
      ) as version_rank
    from public.meat_price_versions as price
    where price.month_at is not null
      and (
        (price_mode = 'shop' and price.shop_price is not null)
        or (price_mode = 'factory' and price.room_price is not null)
      )
  )
  select
    product.id as product_id,
    product.name as product_name,
    product.unit as product_unit,
    product.sort_order,
    price.price_month as month_number,
    price.selected_price as price_per_kg,
    price.selected_price * product.kg_per_package as price_per_package
  from public.prepared_meat_items as product
  join ranked_prices as price
    on price.raw_meat_item_id = product.raw_meat_item_id
   and price.version_rank = 1
  where product.archived_at is null
    and product.is_active
    and product.kg_per_package > 0
    and price.price_year = report_year
  order by product.sort_order nulls last, product.name, price.price_month;
$$;

comment on function public.report_monthly_prepared_meat_prices(integer, text) is
  'Returns the latest non-null monthly shop or factory price for each active prepared-meat product, including its package conversion. Runs as invoker so source-table RLS applies.';
