-- Keep zero-valued category placeholders out of the purchase edit panel.
create or replace function public.get_restaurant_daily_purchase_entries(
  p_single_date date default null,
  p_start_date date default null,
  p_end_date date default null,
  p_restaurant_ids uuid[] default null,
  p_supplier_ids uuid[] default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  purchase_record_id uuid,
  record_date date,
  restaurant_id uuid,
  restaurant_name text,
  supplier_id uuid,
  supplier_name text,
  purchase_type_id uuid,
  purchase_type_name text,
  amount numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    purchase.id,
    purchase.purchase_record_id,
    (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date as record_date,
    purchase.restaurant_id,
    restaurant.name as restaurant_name,
    purchase.supplier_id,
    supplier.company_name as supplier_name,
    purchase.purchase_type_id,
    btrim(purchase_type.name) as purchase_type_name,
    coalesce(purchase.amount, 0) as amount,
    count(*) over () as total_count
  from public.restaurant_supplier_purchases purchase
  join public.restaurants restaurant on restaurant.id = purchase.restaurant_id
  join public.suppliers supplier on supplier.id = purchase.supplier_id
  join public.restaurant_purchase_types purchase_type on purchase_type.id = purchase.purchase_type_id
  where
    coalesce(purchase.amount, 0) > 0
    and (coalesce(cardinality(p_restaurant_ids), 0) = 0 or purchase.restaurant_id = any(p_restaurant_ids))
    and (coalesce(cardinality(p_supplier_ids), 0) = 0 or purchase.supplier_id = any(p_supplier_ids))
    and (
      p_single_date is null
      or (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date = p_single_date
    )
    and (
      p_single_date is not null
      or p_start_date is null
      or (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date >= p_start_date
    )
    and (
      p_single_date is not null
      or p_end_date is null
      or (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date <= p_end_date
    )
  order by
    (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date desc nulls last,
    supplier.company_name,
    restaurant.name,
    purchase.purchase_record_id nulls first,
    purchase_type.sort_order nulls last,
    purchase_type.bubble_created_at nulls last,
    purchase.id
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;
