-- Restore leftover countable items the first pack-unit pass missed
-- (串/塊/pc descriptions). BOM stays in the child unit; stocktake goes
-- back to 包/箱/盒. Do not touch 隻 (蝦/乳鴿), 1:1 packs, 份 berries,
-- 套 paper boxes, or 中式餐具包.
-- Un-scale only the rows whose events are still the multiplied child
-- counts. Pack-count leftovers (雞串/紅棗糕/粉絲春卷/魚柳) keep their
-- entered quantities.
create table pg_temp.remaining_pack_unit_restore (
  id uuid primary key,
  name text not null,
  stocktake_unit text not null,
  product_quantity numeric not null,
  unscale_events boolean not null
);

insert into remaining_pack_unit_restore (
  id, name, stocktake_unit, product_quantity, unscale_events
) values
  ('faf2c049-9c34-441d-9c98-1352b0ab2e54', '亞洲廚沙嗲牛柳肉 18包/箱', '包', 24, true),
  ('eb77c361-6e6b-4eb1-b9ac-db4c33131afa', '鮮肉棒棒餃子 25g 4盒/箱', '盒', 100, true),
  ('58964576-4673-4351-babe-0ebbcafc9250', '絲網鳳尾蝦春卷 42包/箱', '包', 10, true),
  ('0783bd46-7f7b-4313-8765-0e5a6d2e1f3e', '4支牛仔(4支/包,4包/箱) ', '包', 4, true),
  ('5f53a84d-fbac-4162-a44f-e2511afbb7ef', '(醬燒)炭烤精選四式雞串 30g 20包/箱', '包', 8, false),
  ('84bcb735-6a01-43a8-8c78-cd28f3ab3cf9', '紅棗糕', '包', 12, false),
  ('91423366-1d03-4e22-80fe-99d1a03e0454', '粉絲皮春卷', '包', 12, false),
  ('e300b69f-bf26-40c5-b7be-ecbfc6cfc649', '(停售)OMNI 新魚柳 (50g 零售裝)', '包', 4, false),
  ('648cf73e-feff-4a39-b4dc-403c6739fad4', '牛油卷包 40 克', '包', 9, false),
  ('65003e2f-3c1e-49e2-9866-75027ab8fb1f', '特級迷你直牛角酥 21 克', '包', 12, false),
  ('212401d7-3cc4-4944-ab0b-dc0c308933ac', '2.5吋迷你牛油漢堡包 (不切)', '包', 12, false),
  ('fe41eb54-9609-458a-bc3c-7178c4736fdb', '9cm 竹籤 (50支/包)', '包', 50, false);

update public.ingredients ingredient
set stocktake_unit = restore.stocktake_unit,
  product_quantity = restore.product_quantity,
  cost_per_stocktake_unit = coalesce(
    ingredient.cost_per_product_unit * restore.product_quantity,
    ingredient.cost_per_stocktake_unit
  )
from remaining_pack_unit_restore restore
where ingredient.id = restore.id;

update public.ingredient_stocktake_events event
set quantity = event.quantity / restore.product_quantity
from remaining_pack_unit_restore restore
where event.ingredient_id = restore.id
  and restore.unscale_events
  and event.quantity is not null
  and restore.product_quantity > 1
  and not exists (
    select 1
    from public.ingredient_stocktake_events other
    where other.ingredient_id = restore.id
      and other.quantity is not null
      and other.quantity % restore.product_quantity <> 0
  )
  and exists (
    select 1
    from public.ingredient_stocktake_events other
    where other.ingredient_id = restore.id
      and other.quantity is not null
      and other.quantity > restore.product_quantity
  );

update public.packing_stocktake_events event
set quantity = event.quantity / restore.product_quantity
from remaining_pack_unit_restore restore
where event.ingredient_id = restore.id
  and restore.unscale_events
  and event.quantity is not null
  and restore.product_quantity > 1
  and not exists (
    select 1
    from public.packing_stocktake_events other
    where other.ingredient_id = restore.id
      and other.quantity is not null
      and other.quantity % restore.product_quantity <> 0
  )
  and exists (
    select 1
    from public.packing_stocktake_events other
    where other.ingredient_id = restore.id
      and other.quantity is not null
      and other.quantity > restore.product_quantity
  );

do $rebuild_remaining_pack_consumptions$
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
        and consumption.ingredient_id in (select id from remaining_pack_unit_restore)
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
        'restore_remaining_pack_stocktake_units'
      );
    else
      perform private.lock_material_writes();
      perform pg_advisory_xact_lock(hashtextextended(affected.order_id::text, 0));
      perform private.reverse_order_material_consumptions(
        affected.order_id,
        'restore_remaining_pack_stocktake_units'
      );
      perform private.reconcile_legacy_material_consumption(
        affected.order_id,
        'restore_remaining_pack_stocktake_units'
      );
    end if;
  end loop;

  delete from public.order_material_consumptions
  where reversal_reason = 'restore_remaining_pack_stocktake_units';
end
$rebuild_remaining_pack_consumptions$;

do $verify$
begin
  if exists (
    select 1
    from public.ingredients ingredient
    join remaining_pack_unit_restore restore on restore.id = ingredient.id
    where ingredient.stocktake_unit is distinct from restore.stocktake_unit
      or ingredient.product_quantity is distinct from restore.product_quantity
  ) then
    raise exception 'restore_remaining_pack_stocktake_units_failed';
  end if;

  if exists (
    select 1
    from public.ingredients
    where id = '5346734a-df61-4d46-91ed-17db6985c5e6'
      and not (product_unit = '套' and stocktake_unit = '包' and product_quantity = 100)
  ) then
    raise exception 'restore_remaining_pack_stocktake_units_touched_utensil_pack';
  end if;
end
$verify$;
