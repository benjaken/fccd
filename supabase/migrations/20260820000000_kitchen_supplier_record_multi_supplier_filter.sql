-- Allow the monthly supplier-record list and its cost-entry editor to filter
-- by any number of suppliers. Keep the existing single-supplier functions for
-- backwards compatibility with older deployed clients.
create function public.get_kitchen_supplier_records(
  p_single_date date default null,
  p_start_date date default null,
  p_end_date date default null,
  p_supplier_ids uuid[] default null,
  p_limit integer default 15,
  p_offset integer default 0
)
returns table (
  record_date date,
  supplier_id uuid,
  supplier_legacy_id text,
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
      sp.supplier_id,
      sp.purchase_type_id,
      sum(coalesce(sp.amount, 0)) as amount
    from public.supplier_purchases sp
    where
      (coalesce(cardinality(p_supplier_ids), 0) = 0 or sp.supplier_id = any(p_supplier_ids))
      and (
        p_single_date is null
        or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date = p_single_date
      )
      and (
        p_single_date is not null
        or p_start_date is null
        or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date >= p_start_date
      )
      and (
        p_single_date is not null
        or p_end_date is null
        or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date <= p_end_date
      )
    group by sp.supplier_id, sp.purchase_type_id
  ), grouped as (
    select
      p_single_date as record_date,
      f.supplier_id,
      s.legacy_id as supplier_legacy_id,
      s.company_name as supplier_name,
      jsonb_agg(
        jsonb_build_object(
          'purchaseTypeId', pt.id,
          'purchaseTypeLegacyId', pt.legacy_id,
          'name', btrim(pt.name),
          'amount', f.amount
        )
        order by pt.bubble_created_at nulls last, pt.name
      ) as category_amounts,
      sum(f.amount) as total_amount
    from filtered f
    join public.suppliers s on s.id = f.supplier_id
    join public.purchase_types pt on pt.id = f.purchase_type_id
    group by f.supplier_id, s.legacy_id, s.company_name
  )
  select
    g.record_date,
    g.supplier_id,
    g.supplier_legacy_id,
    g.supplier_name,
    g.category_amounts,
    g.total_amount,
    count(*) over () as total_count
  from grouped g
  order by g.supplier_name asc
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.get_kitchen_supplier_cost_entries(
  p_single_date date default null,
  p_start_date date default null,
  p_end_date date default null,
  p_supplier_ids uuid[] default null,
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
    sp.id,
    (sp.purchased_at at time zone 'Asia/Hong_Kong')::date as record_date,
    sp.supplier_id,
    s.company_name as supplier_name,
    sp.purchase_type_id,
    btrim(pt.name) as purchase_type_name,
    coalesce(sp.amount, 0) as amount,
    count(*) over () as total_count
  from public.supplier_purchases sp
  join public.suppliers s on s.id = sp.supplier_id
  join public.purchase_types pt on pt.id = sp.purchase_type_id
  where
    (coalesce(cardinality(p_supplier_ids), 0) = 0 or sp.supplier_id = any(p_supplier_ids))
    and (
      p_single_date is null
      or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date = p_single_date
    )
    and (
      p_single_date is not null
      or p_start_date is null
      or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date >= p_start_date
    )
    and (
      p_single_date is not null
      or p_end_date is null
      or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date <= p_end_date
    )
  order by
    (sp.purchased_at at time zone 'Asia/Hong_Kong')::date desc,
    s.company_name asc,
    pt.bubble_created_at asc nulls last,
    sp.bubble_created_at asc nulls last,
    sp.id
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_kitchen_supplier_records(date, date, date, uuid[], integer, integer) to authenticated;
grant execute on function public.get_kitchen_supplier_cost_entries(date, date, date, uuid[], integer, integer) to authenticated;
