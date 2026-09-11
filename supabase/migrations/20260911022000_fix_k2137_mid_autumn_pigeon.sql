-- K-2137: link the Shopify mid-autumn pigeon upgrade to CCHC78 and capture its
-- $40 package add-on price on the 2026 Mid-Autumn package definitions.

update public.order_lines line
set
  product_id = product.id,
  product_legacy_id = product.legacy_id,
  sku_snapshot = product.sku,
  unit_price = coalesce(nullif(line.unit_price, 0), 40),
  total_price = coalesce(nullif(line.total_price, 0), 40 * line.quantity),
  updated_at = now()
from public.orders ord
join public.products product
  on product.sku = 'CCHC78'
where ord.id = line.order_id
  and ord.order_number = 'K-2137'
  and line.product_name_snapshot like '中秋三味乳鴿皇%'
  and coalesce(line.is_void, false) = false;

update public.package_products member
set
  addon_price = 40,
  updated_at = now()
where coalesce(member.addon_price, 0) = 0
  and exists (
    select 1
    from public.packages package
    join public.products product
      on product.id = member.product_id
    where package.id = member.package_id
      and package.sku like 'CCMA%'
      and product.sku = 'CCHC78'
  );
