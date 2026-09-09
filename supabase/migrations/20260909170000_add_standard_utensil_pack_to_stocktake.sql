-- Standard catering utensil packs and Chinese utensil packs are distinct
-- packing materials. Add the standard pack without rewriting old counts.
insert into public.ingredients (
  id,
  legacy_id,
  name,
  product_unit,
  stocktake_unit,
  product_quantity,
  is_ingredient_stocktake,
  is_packing_stocktake,
  is_active
)
values (
  'c6621db1-b21f-4b62-b6cb-0aef12e34c01',
  'web-packing-material:standard-utensil-pack',
  '餐具包',
  '包',
  '包',
  1,
  false,
  true,
  true
)
on conflict (id) do update
set name = excluded.name,
  product_unit = excluded.product_unit,
  stocktake_unit = excluded.stocktake_unit,
  product_quantity = excluded.product_quantity,
  is_ingredient_stocktake = excluded.is_ingredient_stocktake,
  is_packing_stocktake = excluded.is_packing_stocktake,
  is_active = excluded.is_active;

with latest_stocktake as (
  select max((stocktake_at at time zone 'Asia/Hong_Kong')::date) as stocktake_date
  from public.packing_stocktake_events
)
insert into public.packing_stocktake_events (
  legacy_id,
  ingredient_id,
  stocktake_at,
  quantity,
  created_at
)
select
  'web-packing-stocktake:' || latest_stocktake.stocktake_date::text
    || ':c6621db1-b21f-4b62-b6cb-0aef12e34c01',
  'c6621db1-b21f-4b62-b6cb-0aef12e34c01',
  latest_stocktake.stocktake_date::timestamp at time zone 'Asia/Hong_Kong',
  null,
  now()
from latest_stocktake
where latest_stocktake.stocktake_date is not null
on conflict (legacy_id) do nothing;

do $verify$
begin
  if not exists (
    select 1
    from public.ingredients
    where id = 'c6621db1-b21f-4b62-b6cb-0aef12e34c01'
      and name = '餐具包'
      and product_unit = '包'
      and stocktake_unit = '包'
      and product_quantity = 1
      and is_ingredient_stocktake is false
      and is_packing_stocktake is true
      and is_active is true
  ) then
    raise exception 'standard_utensil_pack_stocktake_repair_failed';
  end if;
end
$verify$;
