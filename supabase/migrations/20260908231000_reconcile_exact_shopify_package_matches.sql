-- Rebuild twelve active packages whose latest Shopify choice-set snapshots map
-- exactly and uniquely to their existing catalog products. Old definitions are
-- detached rather than deleted so historical order references remain valid.

create temp table _exact_package_expected (
  sku text primary key,
  choice_set_count integer not null,
  item_count integer not null
) on commit drop;

insert into _exact_package_expected values
  ('CCBU0406', 4, 8),
  ('CCCH0810', 7, 22),
  ('CCCH1012', 7, 22),
  ('CCCH1215', 7, 21),
  ('CCCH4050', 7, 23),
  ('CCMC0406', 2, 22),
  ('CCMC0810', 7, 16),
  ('CCMC1012', 7, 16),
  ('CCMC1215', 6, 15),
  ('CCMC1520', 7, 17),
  ('CCMC2530', 7, 17),
  ('CCMC4050', 2, 17);

create temp table _exact_package_sources on commit drop as
select distinct on (variant.value ->> 'sku')
  expected.sku,
  package.id as package_id,
  package.legacy_id as package_legacy_id,
  package.channel_id,
  draft.id as draft_id,
  draft.source_updated_at,
  draft.normalized_snapshot
from _exact_package_expected expected
join public.packages package
  on package.sku = expected.sku
 and package.archived_at is null
 and coalesce(package.is_active, true)
join public.shopify_catalog_drafts draft
  on draft.catalog_type = 'configurable_package'
 and draft.shopify_status = 'active'
cross join lateral jsonb_array_elements(draft.normalized_snapshot -> 'variants') variant(value)
where variant.value ->> 'sku' = expected.sku
order by
  variant.value ->> 'sku',
  draft.source_updated_at desc nulls last,
  draft.id desc;

do $$
begin
  if (select count(*) from _exact_package_sources) <> 12 then
    raise exception 'Expected current Shopify snapshots for all twelve exact-match packages';
  end if;
end;
$$;

create temp table _exact_source_choice_sets on commit drop as
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
    'reconcile:shopify-current:%s:choice:%s',
    source.sku,
    choice_set.value ->> 'externalKey'
  ) as legacy_id
from _exact_package_sources source
cross join lateral jsonb_array_elements(source.normalized_snapshot -> 'choiceSets')
  with ordinality as choice_set(value, ordinality);

create temp table _exact_source_items on commit drop as
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
  format(
    'reconcile:shopify-current:%s:item:%s',
    source.sku,
    item.value ->> 'externalKey'
  ) as legacy_id
from _exact_package_sources source
cross join lateral jsonb_array_elements(source.normalized_snapshot -> 'packageItems')
  with ordinality as item(value, ordinality);

do $$
declare
  mismatch record;
begin
  select
    expected.sku,
    expected.choice_set_count,
    count(distinct choice_set.external_key) as actual_choice_sets,
    expected.item_count,
    count(distinct item.external_key) as actual_items
  into mismatch
  from _exact_package_expected expected
  left join _exact_source_choice_sets choice_set on choice_set.sku = expected.sku
  left join _exact_source_items item on item.sku = expected.sku
  group by expected.sku, expected.choice_set_count, expected.item_count
  having count(distinct choice_set.external_key) <> expected.choice_set_count
      or count(distinct item.external_key) <> expected.item_count
  limit 1;

  if found then
    raise exception
      'Unexpected current Shopify structure for %: groups %/% and items %/%',
      mismatch.sku,
      mismatch.actual_choice_sets,
      mismatch.choice_set_count,
      mismatch.actual_items,
      mismatch.item_count;
  end if;
end;
$$;

create temp table _exact_candidate_products on commit drop as
select
  source.sku,
  product.id as product_id,
  product.legacy_id as product_legacy_id,
  product.sku as product_sku,
  product.name as product_name,
  bool_or(member.id is not null) as was_package_member
from _exact_package_sources source
join public.products product
  on product.channel_id = source.channel_id
 and product.archived_at is null
 and coalesce(product.is_active, true)
left join public.package_products member
  on member.package_legacy_id = source.package_legacy_id
 and member.product_id = product.id
group by
  source.sku,
  product.id,
  product.legacy_id,
  product.sku,
  product.name;

create temp table _exact_item_matches on commit drop as
select
  item.*,
  candidate.product_id,
  candidate.product_legacy_id
from _exact_source_items item
join _exact_candidate_products candidate
  on candidate.sku = item.sku
 and regexp_replace(
   lower(translate(candidate.product_name, '（）、，', '(),,')),
   '\s+', '', 'g'
 ) = regexp_replace(
   lower(translate(item.base_name, '（）、，', '(),,')),
   '\s+', '', 'g'
 )
 and (
   candidate.was_package_member
   or not exists (
     select 1
     from _exact_candidate_products existing_candidate
     where existing_candidate.sku = item.sku
       and existing_candidate.was_package_member
       and regexp_replace(
         lower(translate(existing_candidate.product_name, '（）、，', '(),,')),
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
  from _exact_source_items item
  left join _exact_item_matches match
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

  if (select count(*) from _exact_item_matches) <> 216 then
    raise exception 'Expected 216 uniquely mapped items for the twelve packages';
  end if;
end;
$$;

update public.package_products member
set package_id = null, updated_at = now()
where member.package_id in (select package_id from _exact_package_sources);

update public.package_choice_sets choice_set
set package_id = null
where choice_set.package_id in (select package_id from _exact_package_sources);

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
from _exact_source_choice_sets choice_set
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
from _exact_item_matches item
join _exact_source_choice_sets choice_set
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
    count(distinct choice_set.id) as actual_choice_sets,
    expected.item_count,
    count(distinct member.id) as actual_items,
    count(distinct member.id) filter (where member_choice_set.id is null) as ungrouped
  into mismatch
  from _exact_package_expected expected
  join _exact_package_sources source on source.sku = expected.sku
  left join public.package_choice_sets choice_set on choice_set.package_id = source.package_id
  left join public.package_products member on member.package_id = source.package_id
  left join public.package_choice_sets member_choice_set
    on member_choice_set.package_id = source.package_id
   and member_choice_set.legacy_id = member.package_choice_set_legacy_id
  group by expected.sku, expected.choice_set_count, expected.item_count
  having count(distinct choice_set.id) <> expected.choice_set_count
      or count(distinct member.id) <> expected.item_count
      or count(distinct member.id) filter (where member_choice_set.id is null) <> 0
  limit 1;

  if found then
    raise exception
      'Reconciliation failed for %: groups %/%, items %/%, ungrouped %',
      mismatch.sku,
      mismatch.actual_choice_sets,
      mismatch.choice_set_count,
      mismatch.actual_items,
      mismatch.item_count,
      mismatch.ungrouped;
  end if;
end;
$$;
