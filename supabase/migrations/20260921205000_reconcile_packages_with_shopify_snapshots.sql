-- One-off reconciliation of every active configurable package against the
-- latest active Shopify choice-set snapshot. Matched dishes are regrouped and
-- re-quantified, redundant rows are detached, and stale leftovers remain
-- detached for manual review. Unmatched snapshot items are reported, not
-- inserted, because they have no catalog product to point at.

create temp table _recon_draft on commit drop as
select distinct on (v.value->>'sku')
  v.value->>'sku' as sku, d.id as draft_id, d.normalized_snapshot as snap
from shopify_catalog_drafts d
cross join lateral jsonb_array_elements(d.normalized_snapshot->'variants') v(value)
where d.catalog_type = 'configurable_package' and d.shopify_status = 'active'
order by v.value->>'sku', d.source_updated_at desc nulls last, d.id desc;

create temp table _recon_pkg on commit drop as
select p.id as package_id, p.sku, p.channel_id, p.legacy_id as package_legacy_id, d.snap
from packages p
join _recon_draft d on d.sku = p.sku
where p.archived_at is null and coalesce(p.is_active, true);

create temp table _recon_src_sets on commit drop as
select rp.package_id, rp.sku,
  cs.value->>'externalKey' as external_key,
  btrim(regexp_replace(cs.value->>'name', '\s+', ' ', 'g')) as set_name,
  coalesce((cs.value->>'maximumChoices')::numeric, 1) as max_choices,
  coalesce((cs.value->>'sortOrder')::int, cs.ordinality::int - 1) as sort_order
from _recon_pkg rp
cross join lateral jsonb_array_elements(rp.snap->'choiceSets') with ordinality as cs(value, ordinality);

create temp table _recon_set_map on commit drop as
select ss.*,
  coalesce(
    (select fcs.legacy_id from package_choice_sets fcs
      where fcs.package_id = ss.package_id
        and fcs.legacy_id = 'reconcile:shopify-current:' || ss.sku || ':choice:' || ss.external_key
      limit 1),
    (select fcs.legacy_id from package_choice_sets fcs
      where fcs.package_id = ss.package_id
        and regexp_replace(lower(fcs.choice_type), '\s+', '', 'g')
          = regexp_replace(lower(ss.set_name), '\s+', '', 'g')
      order by (select count(*) from package_products pp
                where pp.package_id = fcs.package_id
                  and pp.package_choice_set_legacy_id = fcs.legacy_id) desc
      limit 1),
    'reconcile:shopify-current:' || ss.sku || ':choice:' || ss.external_key
  ) as fccd_set_legacy_id
from _recon_src_sets ss;

insert into public.package_choice_sets (
  legacy_id, package_id, package_legacy_id, choice_type, maximum_choices,
  bubble_created_at, bubble_modified_at, created_at
)
select sm.fccd_set_legacy_id, rp.package_id, rp.package_legacy_id, sm.set_name, sm.max_choices,
  now(), now(), now()
from _recon_set_map sm
join _recon_pkg rp on rp.package_id = sm.package_id
where not exists (select 1 from public.package_choice_sets fcs where fcs.legacy_id = sm.fccd_set_legacy_id)
on conflict (legacy_id) do nothing;

create temp table _recon_src_items on commit drop as
select rp.package_id, rp.sku, rp.channel_id,
  i.value->>'externalKey' as external_key,
  i.value->>'choiceSetKey' as set_key,
  regexp_replace(i.value->>'name', '\s*[xX]\s*[0-9]+\s*$', '', 'i') as base_name,
  coalesce((regexp_match(i.value->>'name', '\s*[xX]\s*([0-9]+)\s*$'))[1]::numeric,
           (i.value->>'quantity')::numeric, 1) as qty,
  coalesce((i.value->>'addonPrice')::numeric, 0) as addon_price,
  (coalesce((i.value->>'isDefault')::boolean, false)
    or coalesce((i.value->>'isRequired')::boolean, false)) as is_selected
from _recon_pkg rp
cross join lateral jsonb_array_elements(rp.snap->'packageItems') i(value);

create temp table _recon_item_match on commit drop as
select si.*, m.product_id
from _recon_src_items si
join lateral (
  select p.id as product_id, count(*) over () as match_count
  from products p
  where p.channel_id = si.channel_id
    and p.archived_at is null
    and coalesce(p.is_active, true)
    and regexp_replace(lower(translate(p.name, '（）、，', '(),,')), '\s+', '', 'g')
      = regexp_replace(lower(translate(si.base_name, '（）、，', '(),,')), '\s+', '', 'g')
) m on true
where m.match_count = 1;

insert into public.package_products (
  legacy_id, package_id, package_legacy_id, product_id, product_legacy_id,
  quantity, addon_price, is_selected, package_choice_set_legacy_id,
  bubble_created_at, bubble_modified_at, created_at, updated_at
)
select
  'reconcile:shopify-current:' || im.sku || ':item:' || im.external_key,
  im.package_id, pkg.legacy_id, im.product_id, product.legacy_id,
  im.qty, im.addon_price, im.is_selected, sm.fccd_set_legacy_id,
  now(), now(), now(), now()
from _recon_item_match im
join _recon_set_map sm on sm.package_id = im.package_id and sm.external_key = im.set_key
join public.packages pkg on pkg.id = im.package_id
join public.products product on product.id = im.product_id
on conflict (legacy_id) do update set
  package_id = excluded.package_id,
  package_legacy_id = excluded.package_legacy_id,
  product_id = excluded.product_id,
  product_legacy_id = excluded.product_legacy_id,
  quantity = excluded.quantity,
  addon_price = excluded.addon_price,
  is_selected = excluded.is_selected,
  package_choice_set_legacy_id = excluded.package_choice_set_legacy_id,
  updated_at = now();

update public.package_products member
set package_id = null, updated_at = now()
where member.package_id in (select distinct package_id from _recon_item_match)
  and member.legacy_id not like 'reconcile:shopify-current:%'
  and exists (
    select 1 from _recon_item_match im
    where im.package_id = member.package_id and im.product_id = member.product_id
  );

update public.package_products member
set package_id = null, updated_at = now()
where member.package_id in (select package_id from _recon_pkg)
  and member.package_choice_set_legacy_id is null
  and exists (
    select 1 from public.package_products grouped
    where grouped.package_id = member.package_id
      and grouped.product_id = member.product_id
      and grouped.package_choice_set_legacy_id is not null
  );

update public.package_choice_sets choice_set
set package_id = null
where choice_set.package_id in (select package_id from _recon_pkg)
  and choice_set.legacy_id not like 'reconcile:shopify-current:%'
  and not exists (
    select 1 from public.package_products member
    where member.package_id = choice_set.package_id
      and member.package_choice_set_legacy_id = choice_set.legacy_id
  );

create temp table _recon2_draft on commit drop as
select distinct on (v.value->>'sku')
  v.value->>'sku' as sku, d.normalized_snapshot as snap
from shopify_catalog_drafts d
cross join lateral jsonb_array_elements(d.normalized_snapshot->'variants') v(value)
where d.catalog_type = 'configurable_package' and d.shopify_status = 'active'
order by v.value->>'sku', d.source_updated_at desc nulls last, d.id desc;

create temp table _recon2_pkg on commit drop as
select p.id as package_id, p.sku, p.channel_id, d.snap
from packages p join _recon2_draft d on d.sku = p.sku
where p.archived_at is null and coalesce(p.is_active, true);

-- snapshot items mapped to their reconcile choice set, keyed by the dish name
-- core (portion descriptor and multiplier removed).
create temp table _recon2_core on commit drop as
select rp.package_id,
  regexp_replace(
    regexp_replace(i.value->>'name', '\s*[xX]\s*[0-9]+\s*$', '', 'i'),
    '\s*[（(][^）)]*[）)]\s*$', '', 'g') as core_raw,
  i.value->>'choiceSetKey' as set_key,
  coalesce((regexp_match(i.value->>'name', '\s*[xX]\s*([0-9]+)\s*$'))[1]::numeric,
           (i.value->>'quantity')::numeric, 1) as qty,
  coalesce((i.value->>'addonPrice')::numeric, 0) as addon_price,
  (coalesce((i.value->>'isDefault')::boolean, false)
    or coalesce((i.value->>'isRequired')::boolean, false)) as is_selected
from _recon2_pkg rp
cross join lateral jsonb_array_elements(rp.snap->'packageItems') i(value);

create temp table _recon2_core_norm on commit drop as
select c.*,
  regexp_replace(lower(translate(btrim(c.core_raw), '（）、，', '(),,')), '\s+', '', 'g') as core_norm,
  count(*) over (partition by c.package_id,
    regexp_replace(lower(translate(btrim(c.core_raw), '（）、，', '(),,')), '\s+', '', 'g')) as core_count
from _recon2_core c;

-- reconcile choice set legacy id for each source set.
create temp table _recon2_set_map on commit drop as
select rp.package_id, cs.value->>'externalKey' as external_key,
  'reconcile:shopify-current:' || rp.sku || ':choice:' || (cs.value->>'externalKey') as fccd_set_legacy_id
from _recon2_pkg rp
cross join lateral jsonb_array_elements(rp.snap->'choiceSets') cs(value);

-- repoint leftover (non-reconcile) members whose dish core uniquely matches a
-- snapshot item, adopting that item's choice set and quantity.
with leftover as (
  select member.id, member.package_id, member.product_id,
    regexp_replace(
      regexp_replace(product.name, '\s*[xX]\s*[0-9]+\s*$', '', 'i'),
      '\s*[（(][^）)]*[）)]\s*$', '', 'g') as core_raw
  from package_products member
  join products product on product.id = member.product_id
  where member.package_id in (select package_id from _recon2_pkg)
    and member.legacy_id not like 'reconcile:shopify-current:%'
)
update package_products member
set package_choice_set_legacy_id = sm.fccd_set_legacy_id,
    quantity = core.qty,
    addon_price = core.addon_price,
    is_selected = core.is_selected,
    updated_at = now()
from leftover
join _recon2_core_norm core
  on core.package_id = leftover.package_id
 and core.core_count = 1
 and core.core_norm = regexp_replace(lower(translate(btrim(leftover.core_raw), '（）、，', '(),,')), '\s+', '', 'g')
join _recon2_set_map sm
  on sm.package_id = core.package_id and sm.external_key = core.set_key
where member.id = leftover.id;

-- detach leftover members that now duplicate a reconcile member for the same
-- product, and empty non-reconcile choice sets.
update package_products member
set package_id = null, updated_at = now()
where member.package_id in (select package_id from _recon2_pkg)
  and member.legacy_id not like 'reconcile:shopify-current:%'
  and exists (
    select 1 from package_products reconciled
    where reconciled.package_id = member.package_id
      and reconciled.product_id = member.product_id
      and reconciled.legacy_id like 'reconcile:shopify-current:%'
  );

update package_choice_sets choice_set
set package_id = null
where choice_set.package_id in (select package_id from _recon2_pkg)
  and choice_set.legacy_id not like 'reconcile:shopify-current:%'
  and not exists (
    select 1 from package_products member
    where member.package_id = choice_set.package_id
      and member.package_choice_set_legacy_id = choice_set.legacy_id
  );

create temp table _recon3_draft on commit drop as
select distinct on (v.value->>'sku')
  v.value->>'sku' as sku, d.normalized_snapshot as snap
from shopify_catalog_drafts d
cross join lateral jsonb_array_elements(d.normalized_snapshot->'variants') v(value)
where d.catalog_type = 'configurable_package' and d.shopify_status = 'active'
order by v.value->>'sku', d.source_updated_at desc nulls last, d.id desc;

create temp table _recon3_pkg on commit drop as
select p.id as package_id, p.sku
from packages p join _recon3_draft d on d.sku = p.sku
where p.archived_at is null and coalesce(p.is_active, true);

-- 1) keep a single member row per (package, product); reconcile rows win.
with ranked as (
  select member.id,
    row_number() over (
      partition by member.package_id, member.product_id
      order by
        (member.legacy_id like 'reconcile:shopify-current:%') desc,
        member.updated_at desc nulls last,
        member.id
    ) as rn
  from package_products member
  where member.package_id in (select package_id from _recon3_pkg)
)
update package_products member
set package_id = null, updated_at = now()
from ranked
where member.id = ranked.id and ranked.rn > 1;

-- 2) normalised dish name core for reconcile members.
create temp table _recon3_core on commit drop as
select member.package_id,
  regexp_replace(lower(translate(btrim(
    regexp_replace(
      regexp_replace(product.name, '\s*[xX]\s*[0-9]+\s*$', '', 'i'),
      '\s*[（(][^）)]*[）)]\s*$', '', 'g')
  ), '（）、，', '(),,')), '\s+', '', 'g') as core_norm
from package_products member
join products product on product.id = member.product_id
where member.package_id is not null
  and member.legacy_id like 'reconcile:shopify-current:%';

-- 3) detach merged leftovers whose dish core already has a reconcile member in
-- the same package (e.g. an old 12-piece variant next to the current 18-piece).
update package_products member
set package_id = null, updated_at = now()
from products product
where member.product_id = product.id
  and member.package_id in (select package_id from _recon3_pkg)
  and member.legacy_id not like 'reconcile:shopify-current:%'
  and member.package_choice_set_legacy_id like 'reconcile:shopify-current:%'
  and exists (
    select 1 from _recon3_core core
    where core.package_id = member.package_id
      and core.core_norm = regexp_replace(lower(translate(btrim(
        regexp_replace(
          regexp_replace(product.name, '\s*[xX]\s*[0-9]+\s*$', '', 'i'),
          '\s*[（(][^）)]*[）)]\s*$', '', 'g')
      ), '（）、，', '(),,')), '\s+', '', 'g')
  );

-- 4) detach choice sets that are now empty.
update package_choice_sets choice_set
set package_id = null
where choice_set.package_id in (select package_id from _recon3_pkg)
  and not exists (
    select 1 from package_products member
    where member.package_id = choice_set.package_id
      and member.package_choice_set_legacy_id = choice_set.legacy_id
  );

