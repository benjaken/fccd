-- Countable children inside 包/箱/盒 (條, 個, 件, ...) are consumed by the
-- child unit. The parent pack size is packaging metadata only. Do not keep
-- the pack-converted consumption quantities (for example 7 條 → 0.35 包).
-- Chinese utensil bags stay on their dedicated six-setting rule.
create table pg_temp.countable_pack_repairs (
  id uuid primary key,
  name text not null,
  old_product_unit text not null,
  old_stocktake_unit text not null,
  old_product_quantity numeric not null
);

insert into countable_pack_repairs (
  id, name, old_product_unit, old_stocktake_unit, old_product_quantity
)
select ingredient.id, ingredient.name, ingredient.product_unit,
  ingredient.stocktake_unit, ingredient.product_quantity
from public.ingredients ingredient
where ingredient.archived_at is null
  and ingredient.id is distinct from '5346734a-df61-4d46-91ed-17db6985c5e6'
  and ingredient.name is distinct from '中式餐具包'
  and ingredient.stocktake_unit in ('包', '箱', '盒')
  and ingredient.product_unit in
    ('條', '個', '件', '粒', '隻', '片', '套', '支', '頭', '罐', '瓶', '卷')
  and ingredient.product_quantity > 1;

update public.ingredients ingredient
set description = coalesce(
    nullif(btrim(ingredient.description), ''),
    trim(trailing '.' from trim(trailing '0' from repairs.old_product_quantity::text))
      || repairs.old_product_unit || '/' || repairs.old_stocktake_unit
  ),
  stocktake_unit = repairs.old_product_unit,
  product_quantity = 1,
  cost_per_stocktake_unit = coalesce(
    ingredient.cost_per_product_unit,
    ingredient.cost_per_stocktake_unit
  )
from countable_pack_repairs repairs
where ingredient.id = repairs.id
  and ingredient.name = repairs.name;

-- Ingredient stocktakes were entered against the parent pack. Convert those
-- leftover pack counts into child units so the ledger stays in one unit.
update public.ingredient_stocktake_events event
set quantity = event.quantity * repairs.old_product_quantity
from countable_pack_repairs repairs
where event.ingredient_id = repairs.id
  and event.quantity is not null;

-- Rebuild every order whose live deduction still uses the old pack quantity.
-- Then drop those reversed pack-converted rows instead of keeping them.
do $rebuild_countable_pack_consumptions$
declare
  affected record;
begin
  for affected in
    select distinct mismatched.order_id, mismatched.material_commitment_v2
    from (
      select consumption.order_id, orders.material_commitment_v2
      from public.order_material_consumptions consumption
      join public.orders orders on orders.id = consumption.order_id
      join public.order_lines line on line.id = consumption.order_line_id
      join lateral private.catering_line_material_requirements(line.id) requirement
        on requirement.ingredient_id = consumption.ingredient_id
      where consumption.reversed_at is null
        and consumption.ingredient_id in (select id from countable_pack_repairs)
      group by consumption.order_id, orders.material_commitment_v2,
        line.id, requirement.ingredient_id, requirement.required_quantity
      having round(sum(consumption.quantity), 3)
        is distinct from round(requirement.required_quantity, 3)
    ) mismatched
    order by mismatched.order_id
  loop
    if affected.material_commitment_v2 then
      perform private.reconcile_order_material_consumption(
        affected.order_id,
        'countable_pack_child_unit_repair'
      );
    else
      perform private.lock_material_writes();
      perform pg_advisory_xact_lock(hashtextextended(affected.order_id::text, 0));
      perform private.reverse_order_material_consumptions(
        affected.order_id,
        'countable_pack_child_unit_repair'
      );
      perform private.reconcile_legacy_material_consumption(
        affected.order_id,
        'countable_pack_child_unit_repair'
      );
    end if;
  end loop;

  delete from public.order_material_consumptions
  where reversal_reason = 'countable_pack_child_unit_repair';
end
$rebuild_countable_pack_consumptions$;

do $verify$
begin
  if exists (
    select 1
    from public.ingredients ingredient
    join countable_pack_repairs repairs on repairs.id = ingredient.id
    where ingredient.product_unit is distinct from repairs.old_product_unit
      or ingredient.stocktake_unit is distinct from repairs.old_product_unit
      or ingredient.product_quantity is distinct from 1
      or ingredient.cost_per_stocktake_unit
        is distinct from ingredient.cost_per_product_unit
  ) then
    raise exception 'countable_pack_child_unit_repair_failed';
  end if;

  if exists (
    select 1
    from public.ingredients
    where id = '5346734a-df61-4d46-91ed-17db6985c5e6'
      and name = '中式餐具包'
      and not (product_unit = '套' and stocktake_unit = '包' and product_quantity = 100)
  ) then
    raise exception 'countable_pack_child_unit_repair_touched_utensil_pack';
  end if;
end
$verify$;
