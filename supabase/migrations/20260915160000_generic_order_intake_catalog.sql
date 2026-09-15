-- Reusable catalog lookup: dates, brands and product terms come from intake rules.
-- Do not privilege a particular holiday or calendar year.
begin;

create or replace function public.search_order_intake_catalog(
  p_channel_ids uuid[],
  p_terms text[],
  p_limit integer default 8
)
returns table (
  name text,
  product_url text
)
language sql
stable
security definer
set search_path = public
as $$
  with requested_terms as (
    select distinct btrim(term) as term
    from unnest(coalesce(p_terms, '{}'::text[])) term
    where nullif(btrim(term), '') is not null
  ),
  candidates as (
    select
      draft.title as name,
      case lower(store.shop_domain)
        when 'foodchannels-catering.myshopify.com' then
          'https://foodchannels-catering.com/products/' || draft.handle
        when 'foodchannels-kitchen.myshopify.com' then
          'https://foodchannels-kitchen.com/products/' || draft.handle
        when 'hk-party-food.myshopify.com' then
          'https://www.hkpartyfood.com/products/' || draft.handle
        else
          'https://' || regexp_replace(store.shop_domain, '^https?://', '') || '/products/' || draft.handle
      end as product_url,
      requested.term,
      row_number() over (
        partition by lower(requested.term)
        order by
          (draft.catalog_type in ('fixed_package', 'configurable_package')) desc,
          draft.title
      ) as term_rank
    from public.shopify_catalog_drafts draft
    join public.shopify_stores store
      on store.id = draft.store_id
     and store.is_active
    cross join requested_terms requested
    where store.channel_id = any(coalesce(p_channel_ids, '{}'::uuid[]))
      and draft.shopify_status = 'active'
      and nullif(btrim(draft.handle), '') is not null
      and (
        draft.title ilike '%' || requested.term || '%'
        or exists (
          select 1 from unnest(draft.tags) tag
          where tag ilike '%' || requested.term || '%'
        )
        or (
          requested.term ilike '%套餐'
          and (
            draft.title ilike '%' || regexp_replace(requested.term, '套餐$', '') || '%'
            or exists (
              select 1 from unnest(draft.tags) tag
              where tag ilike '%' || regexp_replace(requested.term, '套餐$', '') || '%'
            )
          )
          and (
            draft.catalog_type in ('fixed_package', 'configurable_package')
            or draft.title ~* '(套餐|盛宴|到會)'
            or exists (
              select 1 from unnest(draft.tags) tag
              where tag ~* '(套餐|盛宴|到會)'
            )
          )
        )
      )
  ),
  balanced as (
    select distinct on (product_url)
      name,
      product_url,
      term,
      term_rank
    from candidates
    where term_rank <= greatest(1, ceil(greatest(1, least(p_limit, 20))::numeric /
      greatest(1, (select count(*) from requested_terms)))::integer)
    order by product_url, term_rank
  )
  select name, product_url
  from balanced
  order by term, term_rank, name
  limit greatest(1, least(p_limit, 20));
$$;

revoke all on function public.search_order_intake_catalog(uuid[], text[], integer)
  from public, anon, authenticated;
grant execute on function public.search_order_intake_catalog(uuid[], text[], integer)
  to service_role;

commit;
