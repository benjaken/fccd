-- 有皮22片裝厚方包 stores 22 slices per loaf but has no product_unit, so
-- toast platters were deducting 6–18 條 instead of 6–18 片.
update public.ingredients
set product_unit = '片',
  stocktake_unit = '片',
  product_quantity = 1,
  cost_per_stocktake_unit = coalesce(cost_per_product_unit, cost_per_stocktake_unit / 22),
  description = coalesce(nullif(btrim(description), ''), '22片/條')
where id = '9788c374-560e-4546-8c15-d0dc85a2d759'
  and name = '有皮22片裝厚方包'
  and stocktake_unit = '條'
  and product_quantity = 22;

update public.ingredient_stocktake_events event
set quantity = event.quantity * 22
from public.ingredients ingredient
where event.ingredient_id = ingredient.id
  and ingredient.id = '9788c374-560e-4546-8c15-d0dc85a2d759'
  and ingredient.name = '有皮22片裝厚方包'
  and ingredient.stocktake_unit = '片'
  and event.quantity is not null;

do $rebuild_toast$
declare
  affected record;
begin
  for affected in
    select distinct consumption.order_id, orders.material_commitment_v2
    from public.order_material_consumptions consumption
    join public.orders orders on orders.id = consumption.order_id
    where consumption.reversed_at is null
      and consumption.ingredient_id = '9788c374-560e-4546-8c15-d0dc85a2d759'
  loop
    if affected.material_commitment_v2 then
      perform private.reconcile_order_material_consumption(
        affected.order_id, 'countable_toast_loaf_repair'
      );
    else
      perform private.lock_material_writes();
      perform pg_advisory_xact_lock(hashtextextended(affected.order_id::text, 0));
      perform private.reverse_order_material_consumptions(
        affected.order_id, 'countable_toast_loaf_repair'
      );
      perform private.reconcile_legacy_material_consumption(
        affected.order_id, 'countable_toast_loaf_repair'
      );
    end if;
  end loop;

  delete from public.order_material_consumptions
  where reversal_reason = 'countable_toast_loaf_repair';
end
$rebuild_toast$;

do $verify$
begin
  if exists (
    select 1 from public.ingredients
    where id = '9788c374-560e-4546-8c15-d0dc85a2d759'
      and name = '有皮22片裝厚方包'
      and not (product_unit = '片' and stocktake_unit = '片' and product_quantity = 1)
  ) then
    raise exception 'countable_toast_loaf_repair_failed';
  end if;
end
$verify$;
