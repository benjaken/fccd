-- Filter central-kitchen expense-entry rows by supplier and purchase category.
create function public.get_kitchen_supplier_cost_entries(
  p_single_date date default null,
  p_start_date date default null,
  p_end_date date default null,
  p_supplier_ids uuid[] default null,
  p_purchase_type_ids uuid[] default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  record_date date,
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
    purchase.supplier_id,
    supplier.company_name as supplier_name,
    purchase.purchase_type_id,
    btrim(purchase_type.name) as purchase_type_name,
    coalesce(purchase.amount, 0) as amount,
    count(*) over () as total_count
  from public.supplier_purchases purchase
  join public.suppliers supplier on supplier.id = purchase.supplier_id
  join public.purchase_types purchase_type on purchase_type.id = purchase.purchase_type_id
  where
    coalesce(purchase.amount, 0) > 0
    and (coalesce(cardinality(p_supplier_ids), 0) = 0 or purchase.supplier_id = any(p_supplier_ids))
    and (coalesce(cardinality(p_purchase_type_ids), 0) = 0 or purchase.purchase_type_id = any(p_purchase_type_ids))
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
    supplier.company_name,
    purchase.purchase_record_id nulls first,
    purchase_type.bubble_created_at nulls last,
    purchase.bubble_created_at nulls last,
    purchase.id
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_kitchen_supplier_cost_entries(date, date, date, uuid[], uuid[], integer, integer) to authenticated;
