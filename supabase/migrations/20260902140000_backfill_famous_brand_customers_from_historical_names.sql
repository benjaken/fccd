-- Backfill the famous-brand customer tag for recognizable organizations found
-- in historical order and quote snapshots. Company names are matched directly;
-- customer-name fallbacks must include a slash so contact-person names such as
-- "Apple Chan" are not mistaken for the Apple brand.

do $$
declare
  v_tag_id uuid;
  v_tag_legacy_id text;
  v_type_id uuid;
  v_type_legacy_id text;
  v_now timestamptz := now();
begin
  select
    tag.id,
    tag.legacy_id,
    tag.customer_tag_type_id,
    tag.customer_tag_type_legacy_id
    into v_tag_id, v_tag_legacy_id, v_type_id, v_type_legacy_id
  from public.customer_tags as tag
  where tag.name = '知名品牌客戶'
    and tag.is_active = true
  order by tag.created_at
  limit 1;

  if v_tag_id is null then
    raise exception 'Active customer tag "知名品牌客戶" was not found';
  end if;

  create temporary table famous_brand_name_patterns (
    pattern text primary key
  ) on commit drop;

  insert into famous_brand_name_patterns (pattern) values
    -- Existing known brands and recognizable commercial organizations.
    ('%hang seng%'),
    ('%morgan stanley%'),
    ('%morgan stanely%'),
    ('%caritas%'),
    ('%hong kong design centre%'),
    ('%rocco design architects%'),
    ('%new life psychiatric rehabilitation association%'),
    ('%wine passions%'),
    ('%driscoll%'),
    ('%apple%'),
    ('%aesop%'),
    ('%avery dennison%'),
    ('%basf%'),
    ('%bic%'),
    ('%bulgari%'),
    ('%canossa hospital%'),
    ('%check point%'),
    ('%china daily%'),
    ('%cibc%'),
    ('%computershare%'),
    ('%endowus%'),
    ('%ferrari%'),
    ('%general mills%'),
    ('%genreral mills%'),
    ('%grundfos%'),
    ('%hanjin%'),
    ('%kao (hong kong)%'),
    ('%kddi%'),
    ('%kimpton%'),
    ('%longbridge%'),
    ('%manulife%'),
    ('%mercedes-benz%'),
    ('%microsoft%'),
    ('%mox bank%'),
    ('%pwc%'),
    ('%publicis%'),
    ('%rosewood%'),
    ('%shell%'),
    ('%standard chartered%'),
    ('%the macallan%'),
    ('%northern trust%'),
    ('%vistra%'),
    ('%wise%'),
    ('%yusen logistics%'),
    ('%gain capital%'),
    ('%forex.com%'),
    ('%island ecc%'),
    ('%gleneagles%'),
    ('%mit hong kong%'),
    ('%aiesec%'),
    ('%hkpc%'),
    ('%vtc%'),
    -- Universities and major education institutions.
    ('%lingnan university%'),
    ('%hkbu%'),
    ('%hku%'),
    ('%hkust%'),
    ('%hkumed%'),
    ('%polytechnic university%'),
    ('%the university of hong kong%'),
    ('%university of hong kong%'),
    ('%hong kong polytechnic university%'),
    ('%hong kong baptist university%'),
    ('%hong kong chinese university%'),
    ('%chinese university of hong kong%'),
    ('%hong kong education university%'),
    ('%hong kong metropolitan university%'),
    ('%hong kong shue yan university%'),
    ('%hang seng university%'),
    ('%st. francis university%'),
    -- Recognizable Hong Kong public, medical, charity, and cultural bodies.
    ('%香港女童軍%'),
    ('%中國平安%'),
    ('%中國人壽%'),
    ('%中信銀行%'),
    ('%中信期貨%'),
    ('%華為%'),
    ('%數碼通%'),
    ('%愛護動物協會%'),
    ('%香港愛滋病基金會%'),
    ('%香港家庭福利會%'),
    ('%香港復康會%'),
    ('%仁濟醫院%'),
    ('%東華醫院%'),
    ('%東華三院%'),
    ('%明愛%'),
    ('%保良局%'),
    ('%聖雅各福群會%'),
    ('%救世軍%'),
    ('%賽馬會%'),
    ('%香港兒童醫院%'),
    ('%沙田威爾斯醫院%'),
    ('%瑪嘉烈醫院%'),
    ('%青山醫院%'),
    ('%養和醫院%'),
    ('%港安醫院%'),
    ('%香港中醫醫院%'),
    ('%雅麗氏何妙齡那打素%'),
    ('%醫務衞生局%'),
    ('%香港國際航空學院%'),
    ('%香港國際創價學會%'),
    ('%香港海洋公園%'),
    ('%香港大學%'),
    ('%香港中文大學%'),
    ('%香港城市大學%'),
    ('%香港科技大學%'),
    ('%香港教育大學%'),
    ('%香港都會大學%'),
    ('%香港樹仁大學%'),
    ('%香港恒生大學%'),
    ('%聖方濟各大學%'),
    ('%611靈糧堂%'),
    ('%611教會%');

  create temporary table famous_brand_emails (
    email_key text primary key
  ) on commit drop;

  insert into famous_brand_emails (email_key)
  select distinct lower(btrim(order_row.email_snapshot))
  from public.orders as order_row
  where order_row.archived_at is null
    and order_row.email_snapshot is not null
    and btrim(order_row.email_snapshot) <> ''
    and (
      exists (
        select 1
        from famous_brand_name_patterns as name_pattern
        where order_row.company_name_snapshot ilike name_pattern.pattern
      )
      or (
        order_row.customer_name_snapshot like '%/%'
        and exists (
          select 1
          from famous_brand_name_patterns as name_pattern
          where order_row.customer_name_snapshot ilike name_pattern.pattern
        )
      )
    );

  -- Keep one assignment per customer identity, following the existing
  -- customer-id-first, email-fallback convention used by the first backfill.
  with matched_identities as (
    select distinct on (
      coalesce(
        'id:' || order_row.customer_id::text,
        'email:' || lower(btrim(order_row.email_snapshot))
      )
    )
      order_row.customer_id,
      nullif(btrim(order_row.email_snapshot), '') as customer_email_snapshot
    from public.orders as order_row
    join famous_brand_emails as matched
      on matched.email_key = lower(btrim(order_row.email_snapshot))
    where order_row.archived_at is null
      and order_row.email_snapshot is not null
    order by
      coalesce(
        'id:' || order_row.customer_id::text,
        'email:' || lower(btrim(order_row.email_snapshot))
      ),
      coalesce(order_row.bubble_created_at, order_row.created_at) desc
  )
  insert into public.customer_tag_assignments (
    id,
    legacy_id,
    customer_id,
    customer_email_snapshot,
    customer_tag_id,
    customer_tag_legacy_id,
    customer_tag_type_id,
    customer_tag_type_legacy_id,
    bubble_created_at,
    bubble_modified_at
  )
  select
    gen_random_uuid(),
    'web-customer-tag-assignment-' || gen_random_uuid()::text,
    identity_row.customer_id,
    identity_row.customer_email_snapshot,
    v_tag_id,
    v_tag_legacy_id,
    v_type_id,
    v_type_legacy_id,
    v_now,
    v_now
  from matched_identities as identity_row
  where not exists (
    select 1
    from public.customer_tag_assignments as existing
    where existing.customer_tag_id = v_tag_id
      and (
        (
          identity_row.customer_id is not null
          and existing.customer_id = identity_row.customer_id
        )
        or (
          identity_row.customer_email_snapshot is not null
          and lower(btrim(existing.customer_email_snapshot)) = lower(
            identity_row.customer_email_snapshot
          )
        )
      )
  );

  -- Copy the tag to every active quote/order snapshot for the matched email so
  -- both the customer list and historical order detail can use the tag.
  update public.orders as order_row
  set famous_brand_tag_ids = case
        when v_tag_id = any(coalesce(order_row.famous_brand_tag_ids, '{}'))
          then coalesce(order_row.famous_brand_tag_ids, '{}')
        else array_append(
          coalesce(order_row.famous_brand_tag_ids, '{}'),
          v_tag_id
        )
      end,
      updated_at = v_now
  where order_row.archived_at is null
    and order_row.email_snapshot is not null
    and exists (
      select 1
      from famous_brand_emails as matched
      where matched.email_key = lower(btrim(order_row.email_snapshot))
    )
    and not (v_tag_id = any(coalesce(order_row.famous_brand_tag_ids, '{}')));
end;
$$;

notify pgrst, 'reload schema';
