-- Package child dish lines were written with the ordered package count instead
-- of the package member's portion quantity, so packages whose members are two
-- portions (for example 鮮味入饌盛宴 CCCH1520) collapsed every chosen dish to
-- one. Restore the portion count from the current catalog package definition.
-- The affected rows all carry a zero unit price, so this is financially neutral.

-- 1) Lines materialised by the sales-document editor from package choices.
with package_lines as (
  select
    snapshot.order_id,
    snapshot.package_id,
    max(package_line.quantity) as package_quantity
  from public.order_package_choice_snapshots snapshot
  join public.order_lines package_line
    on package_line.order_id = snapshot.order_id
   and package_line.package_id = snapshot.package_id
   and package_line.product_id is null
   and not package_line.is_void
  where snapshot.is_selected = true
    and snapshot.package_id is not null
  group by snapshot.order_id, snapshot.package_id
),
members as (
  select package_id, product_id, max(quantity) as member_quantity
  from public.package_products
  where product_id is not null
    and quantity > 0
  group by package_id, product_id
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
  and child.product_id = members.product_id
  and child.legacy_id like 'web-order-line-%'
  and not child.is_void
  and members.member_quantity > 1
  -- Only the collapsed default (the package count) is corrected; any explicit
  -- quantity an operator set is left untouched.
  and child.quantity = package_lines.package_quantity;

-- 2) Shopify-imported option lines whose remark omitted the portion multiplier.
with package_lines as (
  select order_id, package_id, max(quantity) as package_quantity
  from public.order_lines
  where package_id is not null
    and product_id is null
    and legacy_id like 'shopify:%'
    and legacy_id not like '%:opt:%'
    and not is_void
  group by order_id, package_id
),
members as (
  select package_id, product_id, max(quantity) as member_quantity
  from public.package_products
  where product_id is not null
    and quantity > 0
  group by package_id, product_id
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
  and members.member_quantity > 1
  and child.quantity = package_lines.package_quantity;
