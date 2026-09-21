-- CCPA1520 keeps a stale, unlinked package_products duplicate for two fixed
-- dishes (CMA001-12 美式醬燒豬肋骨, CDE002-12 雲呢嗱泡芙) that still says two
-- portions. The current package definition (the choice-set linked row) says one,
-- so the previous quantity repair over-counted those orders. Align the stale
-- duplicate with the definition and restore the affected order lines.

update public.package_products pp
set quantity = 1,
    updated_at = now()
where pp.package_id = '18550333-b9b6-478f-98ce-6575d3aa2c6c'
  and pp.product_id in (
    select id from public.products where sku in ('CMA001-12', 'CDE002-12')
  )
  and pp.quantity <> 1;

with members as (
  select package_id, product_id, max(quantity) as member_quantity
  from public.package_products
  where product_id is not null
    and quantity > 0
  group by package_id, product_id
),
package_lines as (
  select order_id, package_id, max(quantity) as package_quantity
  from public.order_lines
  where package_id is not null
    and product_id is null
    and legacy_id like 'shopify:%'
    and legacy_id not like '%:opt:%'
    and not is_void
  group by order_id, package_id
)
update public.order_lines child
set quantity = members.member_quantity * package_lines.package_quantity,
    total_price = case
      when child.unit_price is null then child.total_price
      else round(child.unit_price * members.member_quantity * package_lines.package_quantity, 2)
    end,
    updated_at = now()
from package_lines
join members
  on members.package_id = package_lines.package_id
where child.order_id = package_lines.order_id
  and child.package_id = package_lines.package_id
  and child.product_id = members.product_id
  and child.legacy_id like 'shopify:%:opt:%'
  and not child.is_void
  and child.sku_snapshot in ('CMA001-12', 'CDE002-12')
  and child.quantity <> members.member_quantity * package_lines.package_quantity;
