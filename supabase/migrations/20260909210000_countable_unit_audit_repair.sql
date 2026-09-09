-- The first countable-pack repair left mixed units and a few exploded
-- stocktakes. Keep consuming by the child piece (not 0.35 包). Un-multiply
-- stocktakes that were already in pieces, then convert the remaining
-- countable pairs the first pass missed (串/塊, null product_unit, 個/條).
-- Weight (克/kg/包) and 中式餐具包 stay on their existing conversion rules.

-- Historical pack counts of 100+ are not real for these retail items; they
-- are leftover piece counts that the first repair multiplied again.
with repaired as (
  select ingredient.id,
    (regexp_match(ingredient.description, '^([0-9.]+)'))[1]::numeric as child_per_pack
  from public.ingredients ingredient
  where ingredient.product_unit is not distinct from ingredient.stocktake_unit
    and ingredient.product_quantity = 1
    and ingredient.description
      ~ '^[0-9.]+(條|個|件|粒|隻|片|套|支|頭|罐|瓶|卷)/(包|箱|盒)'
    and (regexp_match(ingredient.description, '^([0-9.]+)'))[1]::numeric > 1
)
update public.ingredient_stocktake_events event
set quantity = event.quantity / repaired.child_per_pack
from repaired
where event.ingredient_id = repaired.id
  and event.quantity is not null
  and event.quantity > 0
  and event.quantity / repaired.child_per_pack >= 100;

create table pg_temp.countable_audit_repairs (
  id uuid primary key,
  name text not null,
  old_product_unit text not null,
  old_stocktake_unit text not null,
  old_product_quantity numeric not null
);

insert into countable_audit_repairs (
  id, name, old_product_unit, old_stocktake_unit, old_product_quantity
)
select ingredient.id, ingredient.name,
  coalesce(
    nullif(btrim(ingredient.product_unit), ''),
    (regexp_match(coalesce(ingredient.description, ''),
      '([0-9.]+)(串|塊|條|個|件|粒|隻|片|支|套|份)'))[2],
    case
      when coalesce(ingredient.description, '') ~* '[0-9.]+pc' then '件'
      when ingredient.name like '%肉丸%' then '粒'
    end
  ),
  ingredient.stocktake_unit,
  coalesce(
    nullif(ingredient.product_quantity, 0),
    nullif((regexp_match(coalesce(ingredient.description, ''),
      '([0-9.]+)(串|塊|條|個|件|粒|隻|片|支|套|份)'))[1], '')::numeric,
    nullif((regexp_match(coalesce(ingredient.description, ''),
      '([0-9.]+)pc'))[1], '')::numeric
  )
from public.ingredients ingredient
where ingredient.id is distinct from '5346734a-df61-4d46-91ed-17db6985c5e6'
  and ingredient.name is distinct from '中式餐具包'
  and ingredient.stocktake_unit in ('包', '箱', '盒', '條', '罐', '瓶', '卷', '餅')
  and coalesce(ingredient.product_unit, '') not in ('克', 'g', 'kg', '斤', '磅', '毫')
  and lower(btrim(coalesce(ingredient.product_unit, '')))
    is distinct from lower(btrim(coalesce(ingredient.stocktake_unit, '')))
  and (
    (
      ingredient.product_unit in
        ('條', '個', '件', '粒', '隻', '片', '套', '支', '罐', '瓶', '卷',
         '串', '塊', '份')
      and ingredient.product_quantity > 1
    )
    or (
      nullif(btrim(ingredient.product_unit), '') is null
      and (
        coalesce(ingredient.description, '')
          ~ '([0-9.]+)(串|塊|條|個|件|粒|隻|片|支|套|份|pc)'
        or ingredient.name like '%肉丸%'
      )
      and (
        (
          coalesce(ingredient.product_quantity, 0) > 1
          and coalesce(ingredient.product_quantity, 0) < 500
        )
        or (
          coalesce(ingredient.product_quantity, 0) = 0
          and coalesce(ingredient.description, '')
            ~ '([0-9.]+)(串|塊|條|個|件|粒|隻|片|支|套|份)'
        )
      )
    )
  )
  and coalesce(
    nullif(btrim(ingredient.product_unit), ''),
    (regexp_match(coalesce(ingredient.description, ''),
      '([0-9.]+)(串|塊|條|個|件|粒|隻|片|支|套|份)'))[2],
    case
      when coalesce(ingredient.description, '') ~* '[0-9.]+pc' then '件'
      when ingredient.name like '%肉丸%' then '粒'
    end
  ) is not null;

-- Derive missing child counts from the description for catalog rows that
-- only stored the pack note.
update countable_audit_repairs repairs
set old_product_quantity = coalesce(
  nullif(repairs.old_product_quantity, 0),
  nullif((regexp_match(ingredient.description,
    '([0-9.]+)(串|塊|條|個|件|粒|隻|片|支|套|份)'))[1], '')::numeric
)
from public.ingredients ingredient
where ingredient.id = repairs.id;

delete from countable_audit_repairs
where old_product_unit is null
  or old_stocktake_unit is null
  or old_product_quantity is null
  or old_product_quantity <= 1;

update public.ingredients ingredient
set description = coalesce(
    nullif(btrim(ingredient.description), ''),
    trim(trailing '.' from trim(trailing '0' from repairs.old_product_quantity::text))
      || repairs.old_product_unit || '/' || repairs.old_stocktake_unit
  ),
  product_unit = repairs.old_product_unit,
  stocktake_unit = repairs.old_product_unit,
  product_quantity = 1,
  cost_per_stocktake_unit = coalesce(
    ingredient.cost_per_product_unit,
    ingredient.cost_per_stocktake_unit / nullif(repairs.old_product_quantity, 0),
    ingredient.cost_per_stocktake_unit
  )
from countable_audit_repairs repairs
where ingredient.id = repairs.id
  and ingredient.name = repairs.name;

update public.ingredient_stocktake_events event
set quantity = event.quantity * repairs.old_product_quantity
from countable_audit_repairs repairs
where event.ingredient_id = repairs.id
  and event.quantity is not null;

update public.packing_stocktake_events event
set quantity = event.quantity * repairs.old_product_quantity
from countable_audit_repairs repairs
where event.ingredient_id = repairs.id
  and event.quantity is not null;

do $rebuild_countable_audit_consumptions$
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
        and consumption.ingredient_id in (select id from countable_audit_repairs)
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
        'countable_unit_audit_repair'
      );
    else
      perform private.lock_material_writes();
      perform pg_advisory_xact_lock(hashtextextended(affected.order_id::text, 0));
      perform private.reverse_order_material_consumptions(
        affected.order_id,
        'countable_unit_audit_repair'
      );
      perform private.reconcile_legacy_material_consumption(
        affected.order_id,
        'countable_unit_audit_repair'
      );
    end if;
  end loop;

  delete from public.order_material_consumptions
  where reversal_reason = 'countable_unit_audit_repair';
end
$rebuild_countable_audit_consumptions$;

do $verify$
begin
  if exists (
    select 1
    from public.ingredients ingredient
    join countable_audit_repairs repairs on repairs.id = ingredient.id
    where ingredient.product_unit is distinct from repairs.old_product_unit
      or ingredient.stocktake_unit is distinct from repairs.old_product_unit
      or ingredient.product_quantity is distinct from 1
  ) then
    raise exception 'countable_unit_audit_repair_failed';
  end if;

  if exists (
    select 1
    from public.ingredients
    where id = '5346734a-df61-4d46-91ed-17db6985c5e6'
      and name = '中式餐具包'
      and not (product_unit = '套' and stocktake_unit = '包' and product_quantity = 100)
  ) then
    raise exception 'countable_unit_audit_repair_touched_utensil_pack';
  end if;
end
$verify$;
