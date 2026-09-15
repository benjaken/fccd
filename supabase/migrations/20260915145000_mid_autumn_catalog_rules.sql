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
          (draft.title ilike '%2026%') desc,
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

do $$
declare
  v_rule_id uuid;
  v_name text;
  v_starts_on date;
  v_ends_on date;
  v_channel_ids uuid[];
begin
  select array_agg(id order by name)
  into v_channel_ids
  from public.channels
  where name in ('Catering', 'Kitchen')
    and is_active
    and archived_at is null;

  if cardinality(v_channel_ids) <> 2 then
    raise exception 'Expected active Catering and Kitchen channels';
  end if;

  for v_name, v_starts_on, v_ends_on in
    select * from (values
      ('中秋接單安排（19–20/9）'::text, '2026-09-19'::date, '2026-09-20'::date),
      ('中秋接單安排（25–27/9）'::text, '2026-09-25'::date, '2026-09-27'::date)
    ) schedule(name, starts_on, ends_on)
  loop
    select id
    into v_rule_id
    from public.order_intake_rules
    where archived_at is null
      and starts_on = v_starts_on
      and ends_on = v_ends_on
      and (name = v_name or name = '中秋接單安排')
    order by created_at
    limit 1;

    if v_rule_id is null then
      insert into public.order_intake_rules (
        name, starts_on, ends_on, handling, addon_handling,
        customer_message, internal_note, is_active
      ) values (
        v_name, v_starts_on, v_ends_on, 'allow_only', 'manual_review',
        '中秋送貨繁忙，9月19至20日及25至27日只提供中秋套餐及中秋單點。請留下送貨日期、時間、地區、人數及預算，我哋會盡快跟進。',
        '2026 中秋期間只提供中秋套餐及中秋單點；產品及訂購連結由產品資料庫自動取得。',
        true
      )
      returning id into v_rule_id;
    else
      update public.order_intake_rules
      set name = v_name,
          starts_on = v_starts_on,
          ends_on = v_ends_on,
          start_time = null,
          end_time = null,
          handling = 'allow_only',
          addon_handling = 'manual_review',
          customer_message = '中秋送貨繁忙，9月19至20日及25至27日只提供中秋套餐及中秋單點。請留下送貨日期、時間、地區、人數及預算，我哋會盡快跟進。',
          internal_note = '2026 中秋期間只提供中秋套餐及中秋單點；產品及訂購連結由產品資料庫自動取得。',
          is_active = true,
          updated_at = now()
      where id = v_rule_id;
    end if;

    delete from public.order_intake_rule_channels where rule_id = v_rule_id;
    insert into public.order_intake_rule_channels (
      rule_id, channel_id, brand_terms, product_terms, recommendation_url
    )
    select
      v_rule_id,
      channel_id,
      '{}'::text[],
      array['中秋套餐', '中秋單點']::text[],
      null
    from unnest(v_channel_ids) channel_id;

    v_rule_id := null;
  end loop;
end;
$$;

commit;
