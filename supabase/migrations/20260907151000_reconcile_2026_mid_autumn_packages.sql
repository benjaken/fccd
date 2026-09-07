-- Reconcile all eight 2026 Mid-Autumn packages with their latest Shopify
-- configurable-package snapshots. Historical rows are detached, not deleted,
-- because quote/order snapshots can still reference them.

create temp table _mid_autumn_expected (
  sku text primary key,
  choice_set_count integer not null,
  item_count integer not null
) on commit drop;

insert into _mid_autumn_expected (sku, choice_set_count, item_count) values
  ('CCMA0406', 1, 5),
  ('CCMA0608', 6, 18),
  ('CCMA0810', 7, 18),
  ('CCMA1012', 7, 18),
  ('CCMA1215', 7, 18),
  ('CCMA1520', 5, 18),
  ('CCMA2530', 3, 18),
  ('CCMA4050', 2, 18);

create temp table _mid_autumn_source_packages on commit drop as
select distinct on (variant.value ->> 'sku')
  expected.sku,
  package.id as package_id,
  package.legacy_id as package_legacy_id,
  draft.id as draft_id,
  draft.source_updated_at,
  draft.normalized_snapshot
from _mid_autumn_expected expected
join public.packages package
  on package.sku = expected.sku
join public.shopify_catalog_drafts draft
  on draft.catalog_type = 'configurable_package'
 and draft.title like '%2026%'
cross join lateral jsonb_array_elements(draft.normalized_snapshot -> 'variants') variant(value)
where variant.value ->> 'sku' = expected.sku
order by
  variant.value ->> 'sku',
  draft.source_updated_at desc nulls last,
  draft.created_at desc;

do $$
begin
  if (select count(*) from _mid_autumn_source_packages) <> 8 then
    raise exception 'Expected one 2026 Shopify package snapshot for each of the eight Mid-Autumn SKUs';
  end if;
end;
$$;

create temp table _mid_autumn_source_choice_sets on commit drop as
select
  source.sku,
  source.package_id,
  source.package_legacy_id,
  source.source_updated_at,
  choice_set.value ->> 'externalKey' as external_key,
  btrim(regexp_replace(choice_set.value ->> 'name', '\s+', ' ', 'g')) as choice_type,
  (choice_set.value ->> 'maximumChoices')::numeric(14, 3) as maximum_choices,
  coalesce((choice_set.value ->> 'sortOrder')::integer, choice_set.ordinality::integer - 1) as sort_order,
  format(
    'reconcile:2026-mid-autumn:%s:choice:%s',
    source.sku,
    choice_set.value ->> 'externalKey'
  ) as legacy_id
from _mid_autumn_source_packages source
cross join lateral jsonb_array_elements(source.normalized_snapshot -> 'choiceSets')
  with ordinality as choice_set(value, ordinality);

create temp table _mid_autumn_source_items on commit drop as
select
  source.sku,
  source.package_id,
  source.package_legacy_id,
  source.source_updated_at,
  item.value ->> 'externalKey' as external_key,
  item.value ->> 'choiceSetKey' as choice_set_key,
  item.value ->> 'name' as source_name,
  regexp_replace(item.value ->> 'name', '\s*[xX]\s*([0-9]+)\s*$', '', 'i') as base_name,
  coalesce(
    (regexp_match(item.value ->> 'name', '\s*[xX]\s*([0-9]+)\s*$', 'i'))[1]::numeric,
    (item.value ->> 'quantity')::numeric,
    1
  )::numeric(14, 3) as quantity,
  coalesce((item.value ->> 'addonPrice')::numeric, 0)::numeric(14, 2) as addon_price,
  coalesce((item.value ->> 'isDefault')::boolean, false)
    or coalesce((item.value ->> 'isRequired')::boolean, false) as is_selected,
  item.ordinality::integer - 1 as sort_order,
  case
    when item.value ->> 'name' like '川式涼拌青瓜魚片%' then 'CCO024-1'
    when item.value ->> 'name' like '%荷塘五色小炒%' then 'CCH100-2'
    when item.value ->> 'name' like '中秋三味乳鴿皇%' then 'CCHC78'
    else null
  end as product_sku_override,
  format(
    'reconcile:2026-mid-autumn:%s:item:%s',
    source.sku,
    item.value ->> 'externalKey'
  ) as legacy_id
from _mid_autumn_source_packages source
cross join lateral jsonb_array_elements(source.normalized_snapshot -> 'packageItems')
  with ordinality as item(value, ordinality);

do $$
declare
  mismatch record;
begin
  select
    expected.sku,
    expected.choice_set_count,
    coalesce(choice_sets.actual_count, 0) as actual_choice_set_count,
    expected.item_count,
    coalesce(items.actual_count, 0) as actual_item_count
  into mismatch
  from _mid_autumn_expected expected
  left join (
    select sku, count(*) as actual_count
    from _mid_autumn_source_choice_sets
    group by sku
  ) choice_sets on choice_sets.sku = expected.sku
  left join (
    select sku, count(*) as actual_count
    from _mid_autumn_source_items
    group by sku
  ) items on items.sku = expected.sku
  where coalesce(choice_sets.actual_count, 0) <> expected.choice_set_count
     or coalesce(items.actual_count, 0) <> expected.item_count
  limit 1;

  if found then
    raise exception
      'Unexpected Shopify structure for %: choice sets % (expected %), items % (expected %)',
      mismatch.sku,
      mismatch.actual_choice_set_count,
      mismatch.choice_set_count,
      mismatch.actual_item_count,
      mismatch.item_count;
  end if;
end;
$$;

create temp table _mid_autumn_candidate_products on commit drop as
select distinct
  source.sku,
  product.id as product_id,
  product.legacy_id as product_legacy_id,
  product.sku as product_sku,
  product.name as product_name
from _mid_autumn_source_packages source
join public.package_products member
  on member.package_legacy_id = source.package_legacy_id
join public.products product
  on product.id = member.product_id;

create temp table _mid_autumn_item_matches on commit drop as
select
  item.*,
  candidate.product_id,
  candidate.product_legacy_id,
  candidate.product_sku,
  candidate.product_name
from _mid_autumn_source_items item
join _mid_autumn_candidate_products candidate
  on candidate.sku = item.sku
 and (
   (
     item.product_sku_override is not null
     and candidate.product_sku = item.product_sku_override
   )
   or (
     item.product_sku_override is null
     and regexp_replace(
       lower(translate(candidate.product_name, '（）、，', '(),,')),
       '\s+', '', 'g'
     ) = regexp_replace(
       lower(translate(item.base_name, '（）、，', '(),,')),
       '\s+', '', 'g'
     )
   )
 );

do $$
declare
  mismatch record;
begin
  select
    item.sku,
    item.external_key,
    item.source_name,
    count(match.product_id) as match_count
  into mismatch
  from _mid_autumn_source_items item
  left join _mid_autumn_item_matches match
    on match.sku = item.sku
   and match.external_key = item.external_key
  group by item.sku, item.external_key, item.source_name
  having count(match.product_id) <> 1
  limit 1;

  if found then
    raise exception
      'Could not uniquely map % item % (%): % matches',
      mismatch.sku,
      mismatch.external_key,
      mismatch.source_name,
      mismatch.match_count;
  end if;

  if (select count(*) from _mid_autumn_item_matches) <> 131 then
    raise exception 'Expected 131 uniquely mapped Mid-Autumn package items';
  end if;
end;
$$;

-- Detach every currently published definition. This preserves rows referenced by
-- historical documents while ensuring only the reconciled definition is visible.
update public.package_products member
set
  package_id = null,
  updated_at = now()
where member.package_id in (
  select package_id from _mid_autumn_source_packages
);

update public.package_choice_sets choice_set
set package_id = null
where choice_set.package_id in (
  select package_id from _mid_autumn_source_packages
);

insert into public.package_choice_sets (
  legacy_id,
  package_id,
  package_legacy_id,
  choice_type,
  maximum_choices,
  bubble_created_at,
  bubble_modified_at,
  created_at
)
select
  choice_set.legacy_id,
  choice_set.package_id,
  choice_set.package_legacy_id,
  choice_set.choice_type,
  choice_set.maximum_choices,
  coalesce(choice_set.source_updated_at, now())
    + choice_set.sort_order * interval '1 millisecond',
  choice_set.source_updated_at,
  now()
from _mid_autumn_source_choice_sets choice_set
on conflict (legacy_id) do update set
  package_id = excluded.package_id,
  package_legacy_id = excluded.package_legacy_id,
  choice_type = excluded.choice_type,
  maximum_choices = excluded.maximum_choices,
  bubble_created_at = excluded.bubble_created_at,
  bubble_modified_at = excluded.bubble_modified_at;

insert into public.package_products (
  legacy_id,
  package_id,
  package_legacy_id,
  product_id,
  product_legacy_id,
  quantity,
  addon_price,
  is_selected,
  package_choice_set_legacy_id,
  bubble_created_at,
  bubble_modified_at,
  created_at,
  updated_at
)
select
  item.legacy_id,
  item.package_id,
  item.package_legacy_id,
  item.product_id,
  item.product_legacy_id,
  item.quantity,
  item.addon_price,
  item.is_selected,
  choice_set.legacy_id,
  coalesce(item.source_updated_at, now())
    + (choice_set.sort_order * 100 + item.sort_order) * interval '1 millisecond',
  item.source_updated_at,
  now(),
  now()
from _mid_autumn_item_matches item
join _mid_autumn_source_choice_sets choice_set
  on choice_set.sku = item.sku
 and choice_set.external_key = item.choice_set_key
on conflict (legacy_id) do update set
  package_id = excluded.package_id,
  package_legacy_id = excluded.package_legacy_id,
  product_id = excluded.product_id,
  product_legacy_id = excluded.product_legacy_id,
  quantity = excluded.quantity,
  addon_price = excluded.addon_price,
  is_selected = excluded.is_selected,
  package_choice_set_legacy_id = excluded.package_choice_set_legacy_id,
  bubble_created_at = excluded.bubble_created_at,
  bubble_modified_at = excluded.bubble_modified_at,
  updated_at = now();

do $$
declare
  mismatch record;
begin
  select
    expected.sku,
    expected.choice_set_count,
    coalesce(choice_sets.actual_count, 0) as actual_choice_set_count,
    expected.item_count,
    coalesce(items.actual_count, 0) as actual_item_count,
    coalesce(items.ungrouped_count, 0) as ungrouped_count
  into mismatch
  from _mid_autumn_expected expected
  join _mid_autumn_source_packages source on source.sku = expected.sku
  left join (
    select package_id, count(*) as actual_count
    from public.package_choice_sets
    where package_id in (select package_id from _mid_autumn_source_packages)
    group by package_id
  ) choice_sets on choice_sets.package_id = source.package_id
  left join (
    select
      member.package_id,
      count(*) as actual_count,
      count(*) filter (
        where choice_set.id is null
      ) as ungrouped_count
    from public.package_products member
    left join public.package_choice_sets choice_set
      on choice_set.package_id = member.package_id
     and choice_set.legacy_id = member.package_choice_set_legacy_id
    where member.package_id in (select package_id from _mid_autumn_source_packages)
    group by member.package_id
  ) items on items.package_id = source.package_id
  where coalesce(choice_sets.actual_count, 0) <> expected.choice_set_count
     or coalesce(items.actual_count, 0) <> expected.item_count
     or coalesce(items.ungrouped_count, 0) <> 0
  limit 1;

  if found then
    raise exception
      'Reconciliation verification failed for %: choice sets % (expected %), items % (expected %), ungrouped %',
      mismatch.sku,
      mismatch.actual_choice_set_count,
      mismatch.choice_set_count,
      mismatch.actual_item_count,
      mismatch.item_count,
      mismatch.ungrouped_count;
  end if;
end;
$$;
