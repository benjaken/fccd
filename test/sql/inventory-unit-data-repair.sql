begin;

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id in (
     'fc4cdae7-24b2-433f-8026-2133cc652d27',
     '55255419-1471-4b6b-ac80-9518c686dfd0',
     'dfe98feb-c67d-4df0-b53f-38062380eedb',
     '83a650ca-4ca8-4195-8562-a588c247dfd2'
   )
     and product_unit='個' and stocktake_unit='個' and product_quantity=1
     and cost_per_stocktake_unit=cost_per_product_unit),
  4,
  'piece-counted packaging uses piece units and piece supplier costs'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='b186e205-2a0c-4121-8f33-caea80d6e0d2'
     and product_unit='包' and stocktake_unit='包' and product_quantity=1
     and cost_per_stocktake_unit=cost_per_product_unit
     and description='190g x 36包/箱'),
  1,
  'corn flakes deducts by package and records the 36-package supplier carton'
);

select pg_temp.assert_equal(
  (select sum(quantity) from packing_stocktake_events
   where ingredient_id in (
     'fc4cdae7-24b2-433f-8026-2133cc652d27',
     '55255419-1471-4b6b-ac80-9518c686dfd0',
     'dfe98feb-c67d-4df0-b53f-38062380eedb',
     'b186e205-2a0c-4121-8f33-caea80d6e0d2',
     '83a650ca-4ca8-4195-8562-a588c247dfd2'
   )),
  193,
  'existing stocktake quantities remain in their originally entered piece or package counts'
);

rollback;
