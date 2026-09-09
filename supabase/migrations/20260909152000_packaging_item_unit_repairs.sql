-- These packaging stocktakes have always been entered as loose pieces or
-- packages. Align the material master and supplier cost unit with those
-- existing quantities; do not rescale historical stocktake events.
with repairs(id, name, target_unit) as (
  values
    ('fc4cdae7-24b2-433f-8026-2133cc652d27'::uuid, '500ml 甜品杯'::text, '個'::text),
    ('55255419-1471-4b6b-ac80-9518c686dfd0'::uuid, '300ml 甜品杯'::text, '個'::text),
    ('dfe98feb-c67d-4df0-b53f-38062380eedb'::uuid, '酒精 (1小時)'::text, '個'::text),
    ('b186e205-2a0c-4121-8f33-caea80d6e0d2'::uuid, '粟米片'::text, '包'::text),
    ('83a650ca-4ca8-4195-8562-a588c247dfd2'::uuid, '塑料湯桶 連蓋 2L'::text, '個'::text)
)
update public.ingredients ingredient
set product_unit = repairs.target_unit,
  stocktake_unit = repairs.target_unit,
  product_quantity = 1,
  cost_per_stocktake_unit = coalesce(
    ingredient.cost_per_product_unit,
    ingredient.cost_per_stocktake_unit
  )
from repairs
where ingredient.id = repairs.id
  and ingredient.name = repairs.name;

do $verify$
begin
  if (select count(*) from public.ingredients
      where id in (
        'fc4cdae7-24b2-433f-8026-2133cc652d27',
        '55255419-1471-4b6b-ac80-9518c686dfd0',
        'dfe98feb-c67d-4df0-b53f-38062380eedb',
        'b186e205-2a0c-4121-8f33-caea80d6e0d2',
        '83a650ca-4ca8-4195-8562-a588c247dfd2'
      )
        and product_unit = stocktake_unit
        and product_quantity = 1
        and cost_per_stocktake_unit is not distinct from cost_per_product_unit
  ) <> 5 then
    raise exception 'packaging_item_unit_repair_failed';
  end if;
end
$verify$;

