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
  'pack stocktakes convert to leftover pieces instead of keeping pack counts'
);

select pg_temp.assert_equal(
  (select count(*) from ingredients
   where id='5346734a-df61-4d46-91ed-17db6985c5e6'
     and product_unit='套' and stocktake_unit='包' and product_quantity=100),
  1,
  'chinese utensil packs stay on the dedicated bag rule'
);

insert into products(id,name,sku) values
  ('20000000-0000-0000-0000-000000000080','Sausage bento','CBET02-P');
insert into product_ingredients(product_id,ingredient_id,quantity) values
  ('20000000-0000-0000-0000-000000000080','41be0a73-850b-45d6-8f72-42ec107e3992',1);
insert into orders(id,order_number,delivery_at) values
  ('30000000-0000-0000-0000-000000000080','B-1535-TEST',current_date+4);
insert into order_lines(id,order_id,product_id,quantity,product_name_snapshot) values
  ('40000000-0000-0000-0000-000000000080','30000000-0000-0000-0000-000000000080',
   '20000000-0000-0000-0000-000000000080',7,'(便當) 香酥排骨滷肉飯');
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

rollback;
