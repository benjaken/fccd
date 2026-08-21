-- Supplier-level purchases for the restaurant sales and cost report.

create or replace function public.report_restaurant_sales_cost_suppliers(
  p_start_month date,
  p_end_month date,
  p_restaurant_id uuid
)
returns table (
  month_start date,
  restaurant_id uuid,
  supplier_id text,
  supplier_name text,
  purchases_restaurant numeric,
  purchases_water_bar numeric,
  purchases_misc numeric
)
language sql
stable
set search_path = public
as $$
  select
    date_trunc('month', purchase.purchased_at at time zone 'Asia/Hong_Kong')::date,
    purchase.restaurant_id,
    coalesce(supplier.id::text, purchase.supplier_legacy_id, 'uncategorized'),
    coalesce(nullif(btrim(supplier.company_name), ''), '未分類供應商'),
    sum(coalesce(purchase.amount, 0)) filter (
      where purchase_type.name like '廚房%'
    )::numeric,
    sum(coalesce(purchase.amount, 0)) filter (
      where purchase_type.name like '水吧%'
    )::numeric,
    sum(coalesce(purchase.amount, 0)) filter (
      where purchase_type.name not like '廚房%'
        and purchase_type.name not like '水吧%'
    )::numeric
  from public.restaurant_supplier_purchases purchase
  left join public.suppliers supplier on supplier.id = purchase.supplier_id
  left join public.restaurant_purchase_types purchase_type
    on purchase_type.id = purchase.purchase_type_id
  where purchase.restaurant_id = p_restaurant_id
    and purchase.purchased_at is not null
    and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date
      >= date_trunc('month', p_start_month::timestamp)::date
    and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date
      < date_trunc('month', p_end_month::timestamp)::date + interval '1 month'
  group by 1, 2, 3, 4
  -- The legacy report keeps suppliers in the order they were introduced.
  order by 1, min(supplier.bubble_created_at) nulls last, 4;
$$;

revoke all on function public.report_restaurant_sales_cost_suppliers(date, date, uuid)
  from public, anon;
grant execute on function public.report_restaurant_sales_cost_suppliers(date, date, uuid)
  to authenticated, service_role;

comment on function public.report_restaurant_sales_cost_suppliers(date, date, uuid) is
  'Returns supplier-level monthly purchases split between restaurant, water bar and sundries.';
