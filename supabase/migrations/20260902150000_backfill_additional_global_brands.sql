-- Additional recognizable global organizations found during the historical
-- customer review. This migration is idempotent and extends the same tag used
-- by 20260902140000.

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

  create temporary table additional_famous_brand_patterns (
    pattern text primary key
  ) on commit drop;

  insert into additional_famous_brand_patterns (pattern) values
    ('%brunello cucinelli%'),
    ('%dla piper%'),
    ('%global switch%'),
    ('%ince & co%'),
    ('%macnica%'),
    ('%nv5%'),
    ('%plug and play%'),
    ('%riedel communications%'),
    ('%wavestone%');

  create temporary table additional_famous_brand_emails (
    email_key text primary key
  ) on commit drop;

  insert into additional_famous_brand_emails (email_key)
  select distinct lower(btrim(order_row.email_snapshot))
  from public.orders as order_row
  where order_row.archived_at is null
    and order_row.email_snapshot is not null
    and btrim(order_row.email_snapshot) <> ''
    and (
      exists (
        select 1
        from additional_famous_brand_patterns as name_pattern
        where order_row.company_name_snapshot ilike name_pattern.pattern
      )
      or (
        order_row.customer_name_snapshot like '%/%'
        and exists (
          select 1
          from additional_famous_brand_patterns as name_pattern
          where order_row.customer_name_snapshot ilike name_pattern.pattern
        )
      )
    );

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
    join additional_famous_brand_emails as matched
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
      from additional_famous_brand_emails as matched
      where matched.email_key = lower(btrim(order_row.email_snapshot))
    )
    and not (v_tag_id = any(coalesce(order_row.famous_brand_tag_ids, '{}')));
end;
$$;

notify pgrst, 'reload schema';
