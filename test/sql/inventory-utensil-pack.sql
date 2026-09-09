select pg_temp.assert_equal(
  (select count(*) from ingredients
   where name in ('中式餐具包', '餐具包 (6位)')
     and is_packing_stocktake is true),
  2,
  'Chinese and standard utensil packs are separate packing stocktake items'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where name = '餐具包 (6位)'
     and product_unit = '份'
     and stocktake_unit = '份'
     and product_quantity = 1
     and is_ingredient_stocktake is false
     and is_packing_stocktake is true),
  1,
  'standard utensil pack is counted by package'
);

select pg_temp.assert_equal(
  (select count(*)
   from packing_stocktake_events event
   join ingredients ingredient on ingredient.id = event.ingredient_id
   where ingredient.name = '餐具包 (6位)'
     and event.stocktake_at::date = current_date - 2),
  1,
  'standard utensil pack is added to the current packing stocktake record'
);
