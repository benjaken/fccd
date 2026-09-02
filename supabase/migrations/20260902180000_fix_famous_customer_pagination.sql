-- Apply the named-company condition before the famous-brand tab paginates.
-- The previous compatibility wrapper filtered after LIMIT/OFFSET, which made
-- the returned total and later pages inconsistent when blank-company rows were
-- present.
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 15), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_famous_brand_tag_ids uuid[];
begin
  if coalesce(p_famous_brand_only, false) = false then
    return query
    select *
    from public.list_quote_customers_with_legacy_famous_brand_filter(
      p_search,
      p_sort,
      p_ascending,
      v_limit,
      v_offset,
      false,
      coalesce(p_famous_brand_tag_ids, '{}'::uuid[])
    );
    return;
  end if;

  select coalesce(array_agg(tag.id), '{}'::uuid[])
    into v_famous_brand_tag_ids
  from public.customer_tags as tag
  where lower(btrim(tag.name)) = lower('知名品牌客戶');

  if cardinality(v_famous_brand_tag_ids) = 0 then
    return;
  end if;

  return query
  with recursive first_page as (
    select legacy.*
    from public.list_quote_customers_with_legacy_famous_brand_filter(
      p_search,
      p_sort,
      p_ascending,
      100,
      0,
      false,
      v_famous_brand_tag_ids
    ) as legacy
  ),
  page_offsets(offset_value, total_value) as (
    select 0, coalesce(max(first_page.total_count), 0)
    from first_page
    union all
    select page_offsets.offset_value + 100, page_offsets.total_value
    from page_offsets
    where page_offsets.offset_value + 100 < page_offsets.total_value
  ),
  all_famous_rows as (
    select first_page.*
    from first_page
    union all
    select legacy.*
    from page_offsets
    cross join lateral public.list_quote_customers_with_legacy_famous_brand_filter(
      p_search,
      p_sort,
      p_ascending,
      100,
      page_offsets.offset_value,
      false,
      v_famous_brand_tag_ids
    ) as legacy
    where page_offsets.offset_value > 0
  ),
  named_famous_rows as (
    select all_famous_rows.*
    from all_famous_rows
    where jsonb_array_length(coalesce(all_famous_rows.companies, '[]'::jsonb)) > 0
  )
  select
    named_famous_rows.email,
    named_famous_rows.customer_name,
    named_famous_rows.latest_order_number,
    named_famous_rows.latest_order_id,
    named_famous_rows.latest_document_type,
    named_famous_rows.companies,
    named_famous_rows.order_count,
    named_famous_rows.order_total,
    named_famous_rows.currency,
    named_famous_rows.has_remarks,
    count(*) over() as total_count
  from named_famous_rows
  order by
    case
      when p_sort = 'order_count' then named_famous_rows.order_count::numeric
      else named_famous_rows.order_total
    end * case when coalesce(p_ascending, false) then 1 else -1 end,
    named_famous_rows.email
  limit v_limit
  offset v_offset;
end;
$$;

comment on function public.list_quote_customers(
  text, text, boolean, integer, integer, boolean, uuid[]
) is
  'Lists customers; the famous-brand tab filters the dedicated tag before requiring a named company and paginating.';

notify pgrst, 'reload schema';
