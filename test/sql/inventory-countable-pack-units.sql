begin;

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='41be0a73-850b-45d6-8f72-42ec107e3992'
     and product_unit='條' and stocktake_unit='條' and product_quantity=1
     and cost_per_stocktake_unit=cost_per_product_unit
     and description='20條/20包/箱'),
  1,
  'mini sausages deduct by piece and keep 20-piece pack notes'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='41be0a73-850b-45d6-8f72-42ec107e3992'),
  300,
  'consistent pack stocktakes convert to leftover pieces'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='c1795f8a-f3e2-41a9-8418-c35fb1eefca8'
   order by stocktake_at desc limit 1),
  550,
  'already-piece HOLEKI counts are not multiplied into 121000 pieces'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='36d4be5b-7ea1-4630-9003-c05a07e1bf88'
     and product_unit='塊' and stocktake_unit='塊' and product_quantity=1),
  1,
  'crab cakes missed by the first pack pass now deduct by piece'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='36d4be5b-7ea1-4630-9003-c05a07e1bf88'),
  60,
  'crab cake pack stocktakes convert to leftover pieces'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='7a32395e-b91c-48cf-92a3-57e874fe4788'
     and product_unit='串' and stocktake_unit='串' and product_quantity=1
     and cost_per_stocktake_unit=cost_per_product_unit),
  1,
  'satay skewers with a null product unit now deduct by skewer'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='7a32395e-b91c-48cf-92a3-57e874fe4788'),
  72,
  'satay pack stocktakes convert to leftover skewers'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='dcad7ea7-6a27-41df-acdc-0daa38188393'
     and product_unit='粒' and stocktake_unit='粒' and product_quantity=1),
  1,
  'meatballs deduct by piece instead of treating 24 balls as 24 packs'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='9c756f7b-8e95-4f61-b878-d3ceb8b6b9a4'
     and product_unit='個' and stocktake_unit='個' and product_quantity=1),
  1,
  'yi mein nests deduct by piece instead of 0.1 條'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='9c756f7b-8e95-4f61-b878-d3ceb8b6b9a4'),
  30,
  'yi mein bundle stocktakes convert to leftover nests'
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
   where id='9788c374-560e-4546-8c15-d0dc85a2d759'
     and product_unit='片' and stocktake_unit='片' and product_quantity=1),
  1,
  'thick toast deducts by slice instead of treating 12 pieces as 12 loaves'
);

select pg_temp.assert_equal(
  (select quantity from ingredient_stocktake_events
   where ingredient_id='9788c374-560e-4546-8c15-d0dc85a2d759'),
  66,
  'toast loaf stocktakes convert to leftover slices'
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
  ('20000000-0000-0000-0000-000000000084','Yi mein','CPA008-3'),
  ('20000000-0000-0000-0000-000000000085','Garlic toast','CBA001-12');
insert into product_ingredients(product_id,ingredient_id,quantity) values
  ('20000000-0000-0000-0000-000000000080','41be0a73-850b-45d6-8f72-42ec107e3992',1),
  ('20000000-0000-0000-0000-000000000081','36d4be5b-7ea1-4630-9003-c05a07e1bf88',1),
  ('20000000-0000-0000-0000-000000000082','7a32395e-b91c-48cf-92a3-57e874fe4788',12),
  ('20000000-0000-0000-0000-000000000083','dcad7ea7-6a27-41df-acdc-0daa38188393',24),
  ('20000000-0000-0000-0000-000000000084','9c756f7b-8e95-4f61-b878-d3ceb8b6b9a4',1),
  ('20000000-0000-0000-0000-000000000085','9788c374-560e-4546-8c15-d0dc85a2d759',6);
insert into orders(id,order_number,delivery_at) values
  ('30000000-0000-0000-0000-000000000080','B-1535-TEST',current_date+4);
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
   '20000000-0000-0000-0000-000000000084',1,'蠔皇雜菌干燒伊麵 (3磅)'),
  ('40000000-0000-0000-0000-000000000085','30000000-0000-0000-0000-000000000080',
   '20000000-0000-0000-0000-000000000085',2,'蒜蓉牛油多士 (12件)');
insert into deliveries(id,order_id,delivery_at,delivery_status) values
  ('50000000-0000-0000-0000-000000000080','30000000-0000-0000-0000-000000000080',
   current_date+4,'Pending');

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000080'
  ) where ingredient_id='41be0a73-850b-45d6-8f72-42ec107e3992'),
  7,
  'seven sausage bentos consume seven pieces, not 0.35 packs'
);

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000081'
  ) where ingredient_id='36d4be5b-7ea1-4630-9003-c05a07e1bf88'),
  6,
  'six crab-cake bentos consume six pieces, not 0.4 packs'
);

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000082'
  ) where ingredient_id='7a32395e-b91c-48cf-92a3-57e874fe4788'),
  12,
  'a 12-skewer platter consumes 12 skewers, not 12 packs'
);

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000083'
  ) where ingredient_id='dcad7ea7-6a27-41df-acdc-0daa38188393'),
  48,
  'two 24-ball platters consume 48 meatballs, not 48 packs'
);

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000084'
  ) where ingredient_id='9c756f7b-8e95-4f61-b878-d3ceb8b6b9a4'),
  1,
  'one yi mein dish consumes one nest, not 0.1 bundles'
);

select pg_temp.assert_equal(
  (select required_quantity from private.catering_line_material_requirements(
    '40000000-0000-0000-0000-000000000085'
  ) where ingredient_id='9788c374-560e-4546-8c15-d0dc85a2d759'),
  12,
  'two 6-slice toast platters consume 12 slices, not 12 loaves'
);

rollback;
