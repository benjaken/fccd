create or replace function public.list_quote_customers(
  p_search text default '',
  p_sort text default 'order_total',
  p_ascending boolean default false,
  p_limit integer default 15,
  p_offset integer default 0
)
returns table (
  email text,
  customer_name text,
  latest_order_number text,
  latest_order_id uuid,
  latest_document_type text,
  companies jsonb,
  order_count integer,
  order_total numeric,
  currency text,
  has_remarks boolean,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_like text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 15), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_sort text := case
    when p_sort = 'order_count' then 'order_count'
    else 'order_total'
  end;
begin
  if v_search is not null then
    v_like := '%'
      || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_')
      || '%';
  end if;

  return query
  with source_orders as (
    select
      orders.id,
      orders.order_number,
      orders.document_type,
      orders.customer_name_snapshot,
      orders.company_name_snapshot,
      orders.email_snapshot,
      orders.grand_total,
      orders.currency,
      orders.customer_note_snapshot,
      coalesce(orders.bubble_created_at, orders.created_at) as sort_at,
      lower(btrim(orders.email_snapshot)) as email_key
    from public.orders as orders
    where orders.archived_at is null
      and orders.email_snapshot is not null
      and btrim(orders.email_snapshot) <> ''
      and (
        v_like is null
        or orders.email_snapshot ilike v_like escape '\'
        or orders.customer_name_snapshot ilike v_like escape '\'
        or orders.company_name_snapshot ilike v_like escape '\'
        or orders.order_number ilike v_like escape '\'
      )
  ),
  grouped as (
    select
      source_orders.email_key,
      (array_agg(source_orders.email_snapshot order by source_orders.sort_at desc))[1]
        as email,
      (array_agg(source_orders.customer_name_snapshot order by source_orders.sort_at desc))[1]
        as customer_name,
      (array_agg(source_orders.order_number order by source_orders.sort_at desc))[1]
        as latest_order_number,
      (array_agg(source_orders.id order by source_orders.sort_at desc))[1]
        as latest_order_id,
      (array_agg(source_orders.document_type order by source_orders.sort_at desc))[1]
        as latest_document_type,
      count(*)::integer as order_count,
      coalesce(sum(source_orders.grand_total), 0) as order_total,
      coalesce(
        (array_agg(source_orders.currency::text order by source_orders.sort_at desc))[1],
        'HKD'
      ) as currency,
      bool_or(coalesce(btrim(source_orders.customer_note_snapshot), '') <> '')
        as has_remarks
    from source_orders
    group by source_orders.email_key
  ),
  company_rows as (
    select distinct on (
      source_orders.email_key,
      lower(btrim(coalesce(source_orders.company_name_snapshot, '')))
    )
      source_orders.email_key,
      source_orders.company_name_snapshot as company_name,
      source_orders.order_number as tag,
      source_orders.id as order_id,
      source_orders.document_type,
      source_orders.sort_at
    from source_orders
    order by
      source_orders.email_key,
      lower(btrim(coalesce(source_orders.company_name_snapshot, ''))),
      source_orders.sort_at desc
  ),
  company_groups as (
    select
      company_rows.email_key,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'companyName', company_rows.company_name,
            'tag', company_rows.tag,
            'orderId', company_rows.order_id,
            'documentType', company_rows.document_type
          )
          order by company_rows.sort_at desc
        ),
        '[]'::jsonb
      ) as companies
    from company_rows
    group by company_rows.email_key
  )
  select
    grouped.email,
    grouped.customer_name,
    grouped.latest_order_number,
    grouped.latest_order_id,
    grouped.latest_document_type,
    coalesce(company_groups.companies, '[]'::jsonb),
    grouped.order_count,
    grouped.order_total,
    grouped.currency,
    grouped.has_remarks,
    count(*) over() as total_count
  from grouped
  left join company_groups
    on company_groups.email_key = grouped.email_key
  order by
    case
      when v_sort = 'order_count' then grouped.order_count::numeric
      else grouped.order_total
    end * case when coalesce(p_ascending, false) then 1 else -1 end,
    grouped.email
  limit v_limit
  offset v_offset;
end;
$$;
