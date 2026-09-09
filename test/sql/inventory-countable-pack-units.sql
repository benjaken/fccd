begin;

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='41be0a73-850b-45d6-8f72-42ec107e3992'
     and product_unit='條' and stocktake_unit='包' and product_quantity=20
     and cost_per_stocktake_unit=cost_per_product_unit*20
     and description='20條/20包/箱'),
  1,
  'mini sausages keep 條 BOM and 包 stocktake (20 pieces per pack)'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='41be0a73-850b-45d6-8f72-42ec107e3992'),
  15,
  'pack stocktakes stay in 包 instead of being rewritten as pieces'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='36d4be5b-7ea1-4630-9003-c05a07e1bf88'
     and product_unit='塊' and stocktake_unit='包' and product_quantity=15),
  1,
  'crab cakes keep 塊 BOM and 包 stocktake'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='36d4be5b-7ea1-4630-9003-c05a07e1bf88'),
  4,
  'crab cake pack stocktakes stay in 包'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='7a32395e-b91c-48cf-92a3-57e874fe4788'
     and stocktake_unit='包' and product_quantity=24),
  1,
  'satay skewers keep 包 stocktake'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='7a32395e-b91c-48cf-92a3-57e874fe4788'),
  3,
  'satay pack stocktakes stay in 包'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='dcad7ea7-6a27-41df-acdc-0daa38188393'
     and stocktake_unit='包' and product_quantity=160),
  1,
  'meatballs keep 包 stocktake'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='9c756f7b-8e95-4f61-b878-d3ceb8b6b9a4'
     and product_unit='個' and stocktake_unit='條' and product_quantity=10),
  1,
  'yi mein keeps 個 BOM and 條 stocktake'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='9788c374-560e-4546-8c15-d0dc85a2d759'
     and stocktake_unit='條' and product_quantity=22),
  1,
  'toast loaves keep 條 stocktake (22 slices per loaf)'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='9788c374-560e-4546-8c15-d0dc85a2d759'),
  3,
  'toast loaf stocktakes stay in 條'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='82dffd23-21ea-4549-8ce1-94b4e60f0a2e'
     and product_unit='克' and stocktake_unit='包' and product_quantity=650),
  1,
  'weight-based 克/包 items stay on pack stocktake conversion'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='82dffd23-21ea-4549-8ce1-94b4e60f0a2e'),
  6,
  'weight-based pack stocktakes are not rescaled'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='5346734a-df61-4d46-91ed-17db6985c5e6'
     and product_unit='套' and stocktake_unit='包' and product_quantity=100),
  1,
  'chinese utensil packs stay on the dedicated bag rule'
);

insert into products(id,name,sku) values
  ('20000000-0000-0000-0000-000000000080','Sausage bento','CBET02-P'),
  ('20000000-0000-0000-0000-000000000081','Crab cake bento','CBEC06'),
  ('20000000-0000-0000-0000-000000000082','Satay platter','CSN014-12'),
  ('20000000-0000-0000-0000-000000000083','Meatball platter','CSN045-24'),
  ('20000000-0000-0000-0000-000000000084','Yi mein','CPA008-3');
insert into product_ingredients(product_id,ingredient_id,quantity) values
  ('20000000-0000-0000-0000-000000000080','41be0a73-850b-45d6-8f72-42ec107e3992',1),
  ('20000000-0000-0000-0000-000000000081','36d4be5b-7ea1-4630-9003-c05a07e1bf88',1),
  ('20000000-0000-0000-0000-000000000082','7a32395e-b91c-48cf-92a3-57e874fe4788',12),
  ('20000000-0000-0000-0000-000000000083','dcad7ea7-6a27-41df-acdc-0daa38188393',24),
  ('20000000-0000-0000-0000-000000000084','9c756f7b-8e95-4f61-b878-d3ceb8b6b9a4',1);
insert into orders(id,order_number,delivery_at) values
  ('30000000-0000-0000-0000-000000000080','B-1535-TEST',
   timestamptz '2026-08-29 16:00:00+00');
insert into order_lines(id,order_id,product_id,quantity,product_name_snapshot) values
  ('40000000-0000-0000-0000-000000000080','30000000-0000-0000-0000-000000000080',
   '20000000-0000-0000-0000-000000000080',7,'(便當) 香酥排骨滷肉飯'),
  ('40000000-0000-0000-0000-000000000081','30000000-0000-0000-0000-000000000080',
   '20000000-0000-0000-0000-000000000081',6,'(便當) 咖喱蟹肉薯餅飯'),
  ('40000000-0000-0000-0000-000000000082','30000000-0000-0000-0000-000000000080',
   '20000000-0000-0000-0000-000000000082',1,'沙嗲豬肉串 (12串)'),
  ('40000000-0000-0000-0000-000000000083','30000000-0000-0000-0000-000000000080',
   '20000000-0000-0000-0000-000000000083',2,'忌廉蘑菇肉丸 (24粒)'),
  ('40000000-0000-0000-0000-000000000084','30000000-0000-0000-0000-000000000080',
   '20000000-0000-0000-0000-000000000084',1,'蠔皇雜菌干燒伊麵 (3磅)');
insert into deliveries(id,order_id,delivery_at,delivery_status) values
  ('50000000-0000-0000-0000-000000000080','30000000-0000-0000-0000-000000000080',
   timestamptz '2026-08-29 16:00:00+00','Pending');

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000080'
  ) where ingredient_id='41be0a73-850b-45d6-8f72-42ec107e3992'),
  0.35,
  'seven sausage bentos consume 0.35 packs (7 條 / 20)'
);

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000081'
  ) where ingredient_id='36d4be5b-7ea1-4630-9003-c05a07e1bf88'),
  0.4,
  'six crab-cake bentos consume 0.4 packs (6 塊 / 15)'
);

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000082'
  ) where ingredient_id='7a32395e-b91c-48cf-92a3-57e874fe4788'),
  0.5,
  'a 12-skewer platter consumes 0.5 packs (12 串 / 24)'
);

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000083'
  ) where ingredient_id='dcad7ea7-6a27-41df-acdc-0daa38188393'),
  0.3,
  'two 24-ball platters consume 0.3 packs (48 粒 / 160)'
);

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000084'
  ) where ingredient_id='9c756f7b-8e95-4f61-b878-d3ceb8b6b9a4'),
  0.1,
  'one yi mein dish consumes 0.1 bundles (1 個 / 10)'
);

update deliveries
set delivery_status='待接單'
where id='50000000-0000-0000-0000-000000000080';
set constraints all immediate;

select pg_temp.assert_equal(
  (select count(*) from order_material_consumptions
   where order_id='30000000-0000-0000-0000-000000000080'
     and ingredient_id='41be0a73-850b-45d6-8f72-42ec107e3992'
     and reversed_at is null
     and consumed_at = timestamptz '2026-08-29 16:00:00+00'
     and quantity = 0.35),
  1,
  'sausage consumption is dated at the order delivery time and stored in 包'
);

rollback;
