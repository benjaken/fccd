-- Preserve the legacy Bubble list order: entity creation order first.
create or replace function public.get_restaurant_daily_purchase_records(
  p_single_date date default null,
  p_start_date date default null,
  p_end_date date default null,
  p_restaurant_ids uuid[] default null,
  p_supplier_ids uuid[] default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  record_date date,
  restaurant_id uuid,
  restaurant_name text,
  supplier_id uuid,
  supplier_name text,
  category_amounts jsonb,
  total_amount numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select
      purchase.restaurant_id,
      purchase.supplier_id,
      purchase.purchase_type_id,
      sum(coalesce(purchase.amount, 0)) as amount
    from public.restaurant_supplier_purchases purchase
    where
      (coalesce(cardinality(p_restaurant_ids), 0) = 0 or purchase.restaurant_id = any(p_restaurant_ids))
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
    group by purchase.restaurant_id, purchase.supplier_id, purchase.purchase_type_id
  ), grouped as (
    select
      p_single_date as record_date,
      filtered.restaurant_id,
      restaurant.name as restaurant_name,
      restaurant.bubble_created_at as restaurant_created_at,
      filtered.supplier_id,
      supplier.company_name as supplier_name,
      supplier.bubble_created_at as supplier_created_at,
      jsonb_agg(
        jsonb_build_object(
          'purchaseTypeId', purchase_type.id,
          'purchaseTypeLegacyId', purchase_type.legacy_id,
          'name', btrim(purchase_type.name),
          'amount', filtered.amount
        )
        order by purchase_type.sort_order nulls last,
          purchase_type.bubble_created_at nulls last,
          purchase_type.name
      ) as category_amounts,
      sum(filtered.amount) as total_amount
    from filtered
    join public.restaurants restaurant on restaurant.id = filtered.restaurant_id
    join public.suppliers supplier on supplier.id = filtered.supplier_id
    join public.restaurant_purchase_types purchase_type on purchase_type.id = filtered.purchase_type_id
    group by
      filtered.restaurant_id,
      restaurant.name,
      restaurant.bubble_created_at,
      filtered.supplier_id,
      supplier.company_name,
      supplier.bubble_created_at
  )
  select
    grouped.record_date,
    grouped.restaurant_id,
    grouped.restaurant_name,
    grouped.supplier_id,
    grouped.supplier_name,
    grouped.category_amounts,
    grouped.total_amount,
    count(*) over () as total_count
  from grouped
  order by
    grouped.supplier_created_at asc nulls last,
    grouped.supplier_name,
    grouped.restaurant_created_at asc nulls last,
    grouped.restaurant_name
  limit greatest(1, least(coalesce(p_limit, 100), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

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
    (coalesce(cardinality(p_restaurant_ids), 0) = 0 or purchase.restaurant_id = any(p_restaurant_ids))
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
    (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date desc,
    supplier.bubble_created_at asc nulls last,
    supplier.company_name,
    restaurant.bubble_created_at asc nulls last,
    restaurant.name,
    purchase_type.sort_order nulls last,
    purchase_type.bubble_created_at nulls last,
    purchase.id
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;
