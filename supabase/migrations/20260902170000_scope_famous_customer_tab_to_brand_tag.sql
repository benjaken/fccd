-- Scope the famous-brand tab to the dedicated customer tag. The preceding
-- function migration also supports arbitrary tag ids for legacy callers, but
-- a non-empty arbitrary tag array must not make a customer famous-brand.
alter function public.list_quote_customers(
  text, text, boolean, integer, integer, boolean, uuid[]
)
rename to list_quote_customers_with_legacy_famous_brand_filter;

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
language sql
stable
security invoker
set search_path = ''
as $$
  with famous_tag_ids as (
    select coalesce(array_agg(tag.id), '{}'::uuid[]) as ids
    from public.customer_tags as tag
    where lower(btrim(tag.name)) = lower('知名品牌客戶')
  )
  select
    legacy.email,
    legacy.customer_name,
    legacy.latest_order_number,
    legacy.latest_order_id,
    legacy.latest_document_type,
    legacy.companies,
    legacy.order_count,
    legacy.order_total,
    legacy.currency,
    legacy.has_remarks,
    legacy.total_count
  from famous_tag_ids
  cross join lateral public.list_quote_customers_with_legacy_famous_brand_filter(
    p_search,
    p_sort,
    p_ascending,
    p_limit,
    p_offset,
    false,
    case
      when coalesce(p_famous_brand_only, false) then famous_tag_ids.ids
      else coalesce(p_famous_brand_tag_ids, '{}'::uuid[])
    end
  ) as legacy
  where coalesce(p_famous_brand_only, false) = false
    or jsonb_array_length(coalesce(legacy.companies, '[]'::jsonb)) > 0;
$$;

revoke all on function public.list_quote_customers(
  text, text, boolean, integer, integer, boolean, uuid[]
) from public, anon;
grant execute on function public.list_quote_customers(
  text, text, boolean, integer, integer, boolean, uuid[]
) to authenticated;

comment on function public.list_quote_customers(
  text, text, boolean, integer, integer, boolean, uuid[]
) is
  'Lists customers; the famous-brand tab uses the dedicated famous-brand customer tag and requires a named company.';

notify pgrst, 'reload schema';
