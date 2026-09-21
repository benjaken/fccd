-- Packages that include the fixed dishes CMA001-12 (美式醬燒豬肋骨) and
-- CDE002-12 (雲呢嗱泡芙) carry two kinds of drift from the current Shopify
-- choice-set snapshots:
--   1. CCCNW4050 still says four portions of CMA001-12 while Shopify says three.
--   2. Redundant ungrouped (未分類) member rows duplicate a grouped member.

-- 1) Align the CCCNW4050 portion count with the current Shopify snapshot.
update public.package_products pp
set quantity = 3,
    updated_at = now()
from public.products product,
     public.packages package
where pp.product_id = product.id
  and pp.package_id = package.id
  and product.sku = 'CMA001-12'
  and package.sku = 'CCCNW4050'
  and pp.quantity <> 3;

-- 2) Detach the redundant ungrouped duplicates in the packages that contain the
-- two dishes. Old rows are detached rather than deleted so historical order
-- references stay valid.
with target_packages as (
  select distinct package.id
  from public.package_products member
  join public.products product on product.id = member.product_id
  join public.packages package on package.id = member.package_id
  where product.sku in ('CMA001-12', 'CDE002-12')
    and package.archived_at is null
)
update public.package_products member
set package_id = null,
    updated_at = now()
where member.package_id in (select id from target_packages)
  and member.package_choice_set_legacy_id is null
  and exists (
    select 1
    from public.package_products grouped
    where grouped.package_id = member.package_id
      and grouped.product_id = member.product_id
      and grouped.package_choice_set_legacy_id is not null
  );
