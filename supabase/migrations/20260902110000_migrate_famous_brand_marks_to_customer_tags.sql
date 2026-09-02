-- Move the provisional famous-brand quote marks into the customer-tag model.
-- The source rows were marked by the 2026-09-01 migration and their updated_at
-- values identify that one-day provisional batch in Hong Kong time.

do $$
declare
  v_type_id uuid;
  v_type_legacy_id text;
  v_tag_id uuid;
  v_tag_legacy_id text;
  v_now timestamptz := now();
begin
  select id, legacy_id
    into v_type_id, v_type_legacy_id
  from public.customer_tag_types
  where lower(btrim(name)) = lower('客戶標籤')
  order by is_active desc, created_at
  limit 1;

  if v_type_id is null then
    v_type_id := gen_random_uuid();
    v_type_legacy_id := 'web-customer-tag-type-' || v_type_id::text;
    insert into public.customer_tag_types (
      id, legacy_id, name, is_active, bubble_created_at, bubble_modified_at
    ) values (
      v_type_id, v_type_legacy_id, '客戶標籤', true, v_now, v_now
    );
  else
    update public.customer_tag_types
    set name = '客戶標籤',
        is_active = true,
        bubble_modified_at = v_now
    where id = v_type_id;
  end if;

  select id, legacy_id
    into v_tag_id, v_tag_legacy_id
  from public.customer_tags
  where lower(btrim(name)) = lower('知名品牌客戶')
  order by is_active desc, created_at
  limit 1;

  if v_tag_id is null then
    v_tag_id := gen_random_uuid();
    v_tag_legacy_id := 'web-customer-tag-' || v_tag_id::text;
    insert into public.customer_tags (
      id, legacy_id, customer_tag_type_id, customer_tag_type_legacy_id,
      name, is_active, bubble_created_at, bubble_modified_at
    ) values (
      v_tag_id, v_tag_legacy_id, v_type_id, v_type_legacy_id,
      '知名品牌客戶', true, v_now, v_now
    );
  else
    update public.customer_tags
    set name = '知名品牌客戶',
        customer_tag_type_id = v_type_id,
        customer_tag_type_legacy_id = v_type_legacy_id,
        is_active = true,
        bubble_modified_at = v_now
    where id = v_tag_id;
  end if;

  create temporary table famous_brand_source_quotes on commit drop as
  select
    id,
    customer_id,
    nullif(lower(btrim(email_snapshot)), '') as email_key,
    nullif(
      lower(regexp_replace(btrim(customer_name_snapshot), '\s+', ' ', 'g')),
      ''
    ) as customer_name_key
  from public.orders
  where document_type = 'quote'
    and is_hong_kong_famous_brand = true
    and updated_at >= '2026-09-01 00:00:00+08'::timestamptz
    and updated_at < '2026-09-02 00:00:00+08'::timestamptz;

  -- Historical order snapshots do not have customer_id values in this import,
  -- so email is the durable customer identifier where it exists. Keep an
  -- exact customer-name fallback for the one marked source without email.
  with matched_orders as (
    select distinct on (
      coalesce('id:' || o.customer_id::text, 'email:' || lower(btrim(o.email_snapshot)))
    )
      o.customer_id,
      nullif(btrim(o.email_snapshot), '') as customer_email_snapshot
    from public.orders as o
    join famous_brand_source_quotes as source
      on (
        source.customer_id is not null
        and source.customer_id = o.customer_id
      )
      or (
        source.email_key is not null
        and source.email_key = lower(btrim(o.email_snapshot))
      )
      or (
        source.email_key is null
        and source.customer_name_key is not null
        and source.customer_name_key = nullif(
          lower(regexp_replace(btrim(o.customer_name_snapshot), '\s+', ' ', 'g')),
          ''
        )
      )
    where o.document_type = 'order'
      and o.archived_at is null
      and (
        o.customer_id is not null
        or nullif(btrim(o.email_snapshot), '') is not null
      )
    order by
      coalesce('id:' || o.customer_id::text, 'email:' || lower(btrim(o.email_snapshot))),
      coalesce(o.bubble_created_at, o.created_at) desc
  )
  insert into public.customer_tag_assignments (
    id, legacy_id, customer_id, customer_email_snapshot,
    customer_tag_id, customer_tag_legacy_id,
    customer_tag_type_id, customer_tag_type_legacy_id,
    bubble_created_at, bubble_modified_at
  )
  select
    gen_random_uuid(),
    'web-customer-tag-assignment-' || gen_random_uuid()::text,
    matched_orders.customer_id,
    matched_orders.customer_email_snapshot,
    v_tag_id,
    v_tag_legacy_id,
    v_type_id,
    v_type_legacy_id,
    v_now,
    v_now
  from matched_orders
  where not exists (
    select 1
    from public.customer_tag_assignments as existing
    where existing.customer_tag_id = v_tag_id
      and (
        (
          matched_orders.customer_id is not null
          and existing.customer_id = matched_orders.customer_id
        )
        or (
          matched_orders.customer_email_snapshot is not null
          and lower(btrim(existing.customer_email_snapshot)) = lower(
            matched_orders.customer_email_snapshot
          )
        )
      )
  );

  update public.orders as historical_order
  set famous_brand_tag_ids = case
        when v_tag_id = any(coalesce(historical_order.famous_brand_tag_ids, '{}'))
          then coalesce(historical_order.famous_brand_tag_ids, '{}')
        else array_append(
          coalesce(historical_order.famous_brand_tag_ids, '{}'),
          v_tag_id
        )
      end,
      is_hong_kong_famous_brand = false,
      updated_at = v_now
  where historical_order.document_type = 'order'
    and historical_order.archived_at is null
    and exists (
      select 1
      from famous_brand_source_quotes as source
      where (
        source.customer_id is not null
        and source.customer_id = historical_order.customer_id
      )
      or (
        source.email_key is not null
        and source.email_key = lower(btrim(historical_order.email_snapshot))
      )
      or (
        source.email_key is null
        and source.customer_name_key is not null
        and source.customer_name_key = nullif(
          lower(regexp_replace(btrim(historical_order.customer_name_snapshot), '\s+', ' ', 'g')),
          ''
        )
      )
    );

  -- Remove both representations from the provisional quote batch. The tag
  -- now lives on matching historical orders/customer identities instead.
  update public.orders as provisional_quote
  set is_hong_kong_famous_brand = false,
      famous_brand_tag_ids = '{}',
      updated_at = v_now
  where exists (
    select 1
    from famous_brand_source_quotes as source
    where source.id = provisional_quote.id
  );
end;
$$;

comment on column public.orders.famous_brand_tag_ids is
  'Customer tag ids copied onto order snapshots for legacy customer identities.';
