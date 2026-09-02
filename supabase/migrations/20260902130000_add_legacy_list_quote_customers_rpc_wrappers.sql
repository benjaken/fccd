-- Keep older clients working while avoiding default-argument overloads.
-- Each wrapper has an exact arity and forwards to the canonical 7-argument
-- implementation, so PostgREST can resolve 5-, 6-, and 7-parameter calls.

create or replace function public.list_quote_customers(
  p_search text,
  p_sort text,
  p_ascending boolean,
  p_limit integer,
  p_offset integer
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
  select *
  from public.list_quote_customers(
    p_search,
    p_sort,
    p_ascending,
    p_limit,
    p_offset,
    false,
    '{}'::uuid[]
  );
$$;

create or replace function public.list_quote_customers(
  p_search text,
  p_sort text,
  p_ascending boolean,
  p_limit integer,
  p_offset integer,
  p_famous_brand_only boolean
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
  select *
  from public.list_quote_customers(
    p_search,
    p_sort,
    p_ascending,
    p_limit,
    p_offset,
    p_famous_brand_only,
    '{}'::uuid[]
  );
$$;

revoke all on function public.list_quote_customers(text, text, boolean, integer, integer)
  from public, anon;
grant execute on function public.list_quote_customers(text, text, boolean, integer, integer)
  to authenticated;

revoke all on function public.list_quote_customers(text, text, boolean, integer, integer, boolean)
  from public, anon;
grant execute on function public.list_quote_customers(text, text, boolean, integer, integer, boolean)
  to authenticated;

comment on function public.list_quote_customers(text, text, boolean, integer, integer) is
  'Compatibility wrapper for list_quote_customers without famous-brand filtering.';

comment on function public.list_quote_customers(text, text, boolean, integer, integer, boolean) is
  'Compatibility wrapper for list_quote_customers without customer-tag filtering.';

notify pgrst, 'reload schema';
