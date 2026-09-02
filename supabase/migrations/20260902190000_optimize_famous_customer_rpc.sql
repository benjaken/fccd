-- The previous famous-brand pagination fix fetched every tagged customer in
-- batches before applying the named-company filter. Resolve the tagged
-- customer identities first so the customer aggregation only scans orders
-- belonging to the famous-brand tab.
create index if not exists customer_tag_assignments_tag_legacy_id_idx
  on public.customer_tag_assignments (customer_tag_legacy_id);

create index if not exists customer_tag_assignments_tag_customer_id_idx
  on public.customer_tag_assignments (customer_tag_id, customer_id);

create or replace function public.list_quote_customers(
  p_search text,
  p_sort text,
  p_ascending boolean,
  p_limit integer,
  p_offset integer,
  p_famous_brand_only boolean,
  p_famous_brand_tag_ids uuid[]
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
  v_tag_ids uuid[] := coalesce(p_famous_brand_tag_ids, '{}'::uuid[]);
begin
  if v_search is not null then
    v_like := '%'
      || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_')
      || '%';
  end if;

  if coalesce(p_famous_brand_only, false) = false then
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
        lower(btrim(orders.email_snapshot)) as email_key,
        (
          coalesce(orders.is_hong_kong_famous_brand, false)
          or exists (
            select 1
            from public.orders as source_quote
            where source_quote.id = orders.source_quote_id
              and source_quote.is_hong_kong_famous_brand = true
          )
          or cardinality(coalesce(
            nullif(orders.famous_brand_tag_ids, '{}'::uuid[]),
            (
              select nullif(source_quote.famous_brand_tag_ids, '{}'::uuid[])
              from public.orders as source_quote
              where source_quote.id = orders.source_quote_id
            ),
            '{}'::uuid[]
          )) > 0
          or exists (
            select 1
            from public.customer_tag_assignments as tag_assignment
            left join public.customer_tags as famous_tag
              on famous_tag.id = tag_assignment.customer_tag_id
              or famous_tag.legacy_id = tag_assignment.customer_tag_legacy_id
            where lower(btrim(famous_tag.name)) = lower('知名品牌客戶')
              and (
                tag_assignment.customer_id = orders.customer_id
                or lower(btrim(tag_assignment.customer_email_snapshot)) =
                  lower(btrim(orders.email_snapshot))
              )
          )
        ) as is_famous_brand,
        (
          coalesce(
            nullif(orders.famous_brand_tag_ids, '{}'::uuid[]),
            (
              select nullif(source_quote.famous_brand_tag_ids, '{}'::uuid[])
              from public.orders as source_quote
              where source_quote.id = orders.source_quote_id
            ),
            '{}'::uuid[]
          ) && v_tag_ids
          or exists (
            select 1
            from public.customer_tag_assignments as tag_assignment
            where (
              tag_assignment.customer_tag_id = any(v_tag_ids)
              or exists (
                select 1
                from public.customer_tags as selected_tag
                where selected_tag.id = any(v_tag_ids)
                  and selected_tag.legacy_id = tag_assignment.customer_tag_legacy_id
              )
            )
            and (
              tag_assignment.customer_id = orders.customer_id
              or lower(btrim(tag_assignment.customer_email_snapshot)) =
                lower(btrim(orders.email_snapshot))
            )
          )
        ) as has_selected_famous_brand_tag
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
          as has_remarks,
        bool_or(source_orders.is_famous_brand) as is_famous_brand,
        bool_or(source_orders.has_selected_famous_brand_tag)
          as has_selected_famous_brand_tag
      from source_orders
      group by source_orders.email_key
    ),
    company_rows as (
      select distinct on (
        source_orders.email_key,
        lower(btrim(source_orders.company_name_snapshot))
      )
        source_orders.email_key,
        source_orders.company_name_snapshot as company_name,
        source_orders.order_number as tag,
        source_orders.id as order_id,
        source_orders.document_type,
        source_orders.sort_at
      from source_orders
      where nullif(btrim(source_orders.company_name_snapshot), '') is not null
      order by
        source_orders.email_key,
        lower(btrim(source_orders.company_name_snapshot)),
        source_orders.sort_at desc
    ),
    company_groups as (
      select
        company_rows.email_key,
        jsonb_agg(
          jsonb_build_object(
            'companyName', company_rows.company_name,
            'tag', company_rows.tag,
            'orderId', company_rows.order_id,
            'documentType', company_rows.document_type
          )
          order by company_rows.sort_at desc
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
    where cardinality(v_tag_ids) = 0
      or grouped.has_selected_famous_brand_tag = true
    order by
      case
        when v_sort = 'order_count' then grouped.order_count::numeric
        else grouped.order_total
      end * case when coalesce(p_ascending, false) then 1 else -1 end,
      grouped.email
    limit v_limit
    offset v_offset;
    return;
  end if;

  select coalesce(array_agg(tag.id), '{}'::uuid[])
    into v_tag_ids
  from public.customer_tags as tag
  where lower(btrim(tag.name)) = lower('知名品牌客戶');

  if cardinality(v_tag_ids) = 0 then
    return;
  end if;

  return query
  with selected_tag_assignments as materialized (
    select distinct
      tag_assignment.customer_id,
      nullif(lower(btrim(tag_assignment.customer_email_snapshot)), '') as email_key
    from public.customer_tag_assignments as tag_assignment
    where tag_assignment.customer_tag_id = any(v_tag_ids)
      or exists (
        select 1
        from public.customer_tags as selected_tag
        where selected_tag.id = any(v_tag_ids)
          and selected_tag.legacy_id = tag_assignment.customer_tag_legacy_id
      )
  ),
  famous_customer_emails as (
    select lower(btrim(orders.email_snapshot)) as email_key
    from public.orders as orders
    where orders.archived_at is null
      and orders.email_snapshot is not null
      and btrim(orders.email_snapshot) <> ''
      and orders.famous_brand_tag_ids && v_tag_ids

    union

    select lower(btrim(orders.email_snapshot)) as email_key
    from public.orders as orders
    join public.orders as source_quote
      on source_quote.id = orders.source_quote_id
    where orders.archived_at is null
      and orders.email_snapshot is not null
      and btrim(orders.email_snapshot) <> ''
      and nullif(orders.famous_brand_tag_ids, '{}'::uuid[]) is null
      and source_quote.famous_brand_tag_ids && v_tag_ids

    union

    select lower(btrim(orders.email_snapshot)) as email_key
    from public.orders as orders
    join selected_tag_assignments as tag_assignment
      on tag_assignment.customer_id = orders.customer_id
    where orders.archived_at is null
      and orders.email_snapshot is not null
      and btrim(orders.email_snapshot) <> ''
      and tag_assignment.customer_id is not null

    union

    select lower(btrim(orders.email_snapshot)) as email_key
    from public.orders as orders
    join selected_tag_assignments as tag_assignment
      on tag_assignment.email_key = lower(btrim(orders.email_snapshot))
    where orders.archived_at is null
      and orders.email_snapshot is not null
      and btrim(orders.email_snapshot) <> ''
      and tag_assignment.email_key is not null
  ),
  source_orders as (
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
    join famous_customer_emails
      on famous_customer_emails.email_key = lower(btrim(orders.email_snapshot))
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
      lower(btrim(source_orders.company_name_snapshot))
    )
      source_orders.email_key,
      source_orders.company_name_snapshot as company_name,
      source_orders.order_number as tag,
      source_orders.id as order_id,
      source_orders.document_type,
      source_orders.sort_at
    from source_orders
    where nullif(btrim(source_orders.company_name_snapshot), '') is not null
    order by
      source_orders.email_key,
      lower(btrim(source_orders.company_name_snapshot)),
      source_orders.sort_at desc
  ),
  company_groups as (
    select
      company_rows.email_key,
      jsonb_agg(
        jsonb_build_object(
          'companyName', company_rows.company_name,
          'tag', company_rows.tag,
          'orderId', company_rows.order_id,
          'documentType', company_rows.document_type
        )
        order by company_rows.sort_at desc
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
    company_groups.companies,
    grouped.order_count,
    grouped.order_total,
    grouped.currency,
    grouped.has_remarks,
    count(*) over() as total_count
  from grouped
  join company_groups
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

comment on function public.list_quote_customers(
  text, text, boolean, integer, integer, boolean, uuid[]
) is
  'Lists customers; the famous-brand path resolves tagged customer identities before aggregating and paginating.';

notify pgrst, 'reload schema';
