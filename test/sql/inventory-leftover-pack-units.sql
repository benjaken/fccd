begin;

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='faf2c049-9c34-441d-9c98-1352b0ab2e54'
     and product_unit='串' and stocktake_unit='包' and product_quantity=24
     and cost_per_stocktake_unit=cost_per_product_unit*24),
  1,
  'beef satay keeps 串 BOM and 包 stocktake (24 skewers per pack)'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='faf2c049-9c34-441d-9c98-1352b0ab2e54'),
  12,
  'beef satay piece-scale stocktakes unscale back to 包'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='eb77c361-6e6b-4eb1-b9ac-db4c33131afa'
     and product_unit='件' and stocktake_unit='盒' and product_quantity=100),
  1,
  'dumpling boxes keep 件 BOM and 盒 stocktake'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='eb77c361-6e6b-4eb1-b9ac-db4c33131afa'),
  6,
  'dumpling piece-scale stocktakes unscale back to 盒'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='0783bd46-7f7b-4313-8765-0e5a6d2e1f3e'
     and product_unit='支' and stocktake_unit='包' and product_quantity=4),
  1,
  'cowboy rolls keep 支 BOM and 包 stocktake'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='0783bd46-7f7b-4313-8765-0e5a6d2e1f3e'),
  8,
  'cowboy-roll stocktakes unscale from multiplied 支 counts back to 包'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='5f53a84d-fbac-4162-a44f-e2511afbb7ef'
     and product_unit='串' and stocktake_unit='包' and product_quantity=8),
  1,
  'chicken skewers keep 串 BOM and 包 stocktake'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='5f53a84d-fbac-4162-a44f-e2511afbb7ef'),
  13,
  'chicken-skewer pack counts are not divided'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='648cf73e-feff-4a39-b4dc-403c6739fad4'
     and product_unit='個' and stocktake_unit='包' and product_quantity=9),
  1,
  'butter rolls keep 個 BOM and 包 stocktake'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='5346734a-df61-4d46-91ed-17db6985c5e6'
     and product_unit='套' and stocktake_unit='包' and product_quantity=100),
  1,
  'chinese utensil packs stay on the dedicated bag rule'
);

insert into products(id,name,sku) values
  ('20000000-0000-0000-0000-000000000090','Beef satay platter','CSN015-12');
insert into product_ingredients(product_id,ingredient_id,quantity) values
  ('20000000-0000-0000-0000-000000000090','faf2c049-9c34-441d-9c98-1352b0ab2e54',12);
insert into orders(id,order_number,delivery_at) values
  ('30000000-0000-0000-0000-000000000090','B-SATAY-BEEF',
   timestamptz '2026-09-11 16:00:00+00');
insert into order_lines(id,order_id,product_id,quantity,product_name_snapshot) values
  ('40000000-0000-0000-0000-000000000090','30000000-0000-0000-0000-000000000090',
   '20000000-0000-0000-0000-000000000090',1,'沙嗲牛柳肉串 (12串)');
insert into deliveries(id,order_id,delivery_at,delivery_status) values
  ('50000000-0000-0000-0000-000000000090','30000000-0000-0000-0000-000000000090',
   timestamptz '2026-09-11 16:00:00+00','Pending');

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000090'
  ) where ingredient_id='faf2c049-9c34-441d-9c98-1352b0ab2e54'),
  0.5,
  'a 12-skewer beef platter consumes 0.5 packs (12 串 / 24)'
);

update deliveries
set delivery_status='待接單'
where id='50000000-0000-0000-0000-000000000090';
set constraints all immediate;

select pg_temp.assert_equal(
  (select count(*) from order_material_consumptions
   where order_id='30000000-0000-0000-0000-000000000090'
     and ingredient_id='faf2c049-9c34-441d-9c98-1352b0ab2e54'
     and reversed_at is null
     and consumed_at = timestamptz '2026-09-11 16:00:00+00'
     and quantity = 0.5),
  1,
  'beef satay consumption is dated at delivery and stored in 包'
);

rollback;
