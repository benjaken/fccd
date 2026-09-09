-- Review cases use an independent order and roll back their fixtures.
begin;
insert into orders(id,order_number,delivery_at) values ('30000000-0000-0000-0000-000000000020','BOM-REVIEW',current_date+2);
insert into order_lines(id,order_id,product_id,quantity) values ('40000000-0000-0000-0000-000000000020','30000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000001',10);
update product_ingredients set quantity=2 where ingredient_id='10000000-0000-0000-0000-000000000001';
insert into order_bom_requirements(order_line_id,ingredient_id) values ('40000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000001');
select pg_temp.assert_equal((select coalesce(sum(required_quantity),0) from private.catering_line_material_requirements('40000000-0000-0000-0000-000000000020') where ingredient_id='10000000-0000-0000-0000-000000000001'),20,'empty snapshot uses valid recipe');
update order_lines set product_id='20000000-0000-0000-0000-000000000002' where id='40000000-0000-0000-0000-000000000020';
select pg_temp.assert_equal(private.catering_line_material_is_unmapped('40000000-0000-0000-0000-000000000020')::integer,1,'empty snapshot warns without recipe');
insert into order_bom_requirements(order_line_id,ingredient_id,ingredient_quantity) values ('40000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000001',3);
select pg_temp.assert_equal((select coalesce(sum(required_quantity),0) from private.catering_line_material_requirements('40000000-0000-0000-0000-000000000020')),30,'fresh import after product change');
select pg_temp.assert_equal(private.catering_line_material_is_unmapped('40000000-0000-0000-0000-000000000020')::integer,0,'fresh import clears warning');
update order_lines set product_id=null,package_id='90000000-0000-0000-0000-000000000020' where id='40000000-0000-0000-0000-000000000020';
insert into package_products(id,package_id,product_id,quantity,is_selected) values
('91000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000001',1,true),
('91000000-0000-0000-0000-000000000021','90000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000002',1,false);
insert into order_package_choice_snapshots(order_line_id,package_product_id,is_selected) values ('40000000-0000-0000-0000-000000000020','91000000-0000-0000-0000-000000000021',true);
select pg_temp.assert_equal(private.catering_line_material_is_unmapped('40000000-0000-0000-0000-000000000020')::integer,1,'actual option without recipe warns');
-- A valid chosen item must not hide a second chosen item without a recipe.
insert into order_package_choice_snapshots(order_line_id,package_product_id,is_selected) values ('40000000-0000-0000-0000-000000000020','91000000-0000-0000-0000-000000000020',true);
select pg_temp.assert_equal(private.catering_line_material_is_unmapped('40000000-0000-0000-0000-000000000020')::integer,1,'partially unmapped choices warn');
insert into deliveries(order_id,delivery_at,delivery_status) values ('30000000-0000-0000-0000-000000000020',current_date+2,'Pending');
set constraints all immediate;
select pg_temp.assert_equal((select unmapped_line_count from inventory_forecast_order_shortages(current_date,14) where order_id='30000000-0000-0000-0000-000000000020'),1,'partial choice warning reaches forecast');
select pg_temp.assert_equal((select count(*) from inventory_forecast_unmapped_order_lines(current_date,14) where order_number='BOM-REVIEW'),1,'partial choice warning reaches email');
-- Packing-only snapshots must not suppress the missing selected recipe.
insert into order_bom_requirements(order_line_id,ingredient_id,ingredient_quantity) values ('40000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000002',1);
select pg_temp.assert_equal(private.catering_line_material_is_unmapped('40000000-0000-0000-0000-000000000020')::integer,1,'packing snapshot cannot hide missing recipe');
-- Import replacement BOM after the last option edit; old 30 kg must stay stale.
insert into order_bom_requirements(order_line_id,ingredient_id,ingredient_quantity) values ('40000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000001',4);
select pg_temp.assert_equal((select sum(required_quantity) from private.catering_line_material_requirements('40000000-0000-0000-0000-000000000020') where ingredient_id='10000000-0000-0000-0000-000000000001'),40,'new snapshot does not revive old rows');
select pg_temp.assert_equal(private.catering_line_material_is_unmapped('40000000-0000-0000-0000-000000000020')::integer,1,'partial snapshot cannot prove selected product recipe');
-- Unchanged option saves must preserve the imported 40 kg.
update order_package_choice_snapshots set is_selected=is_selected where order_line_id='40000000-0000-0000-0000-000000000020';
select pg_temp.assert_equal((select sum(required_quantity) from private.catering_line_material_requirements('40000000-0000-0000-0000-000000000020') where ingredient_id='10000000-0000-0000-0000-000000000001'),40,'unchanged option preserves snapshot');
-- Unlinked importer rows can be inserted, updated, linked and deleted.
insert into order_package_choice_snapshots(id,order_id,is_selected) values ('92000000-0000-0000-0000-000000000020','30000000-0000-0000-0000-000000000020',false);
update order_package_choice_snapshots set is_selected=true where id='92000000-0000-0000-0000-000000000020';
delete from order_package_choice_snapshots where id='92000000-0000-0000-0000-000000000020';
update deliveries set delivery_status='待接單' where order_id='30000000-0000-0000-0000-000000000020';
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000020' and ingredient_id='10000000-0000-0000-0000-000000000001' and reversed_at is null),40,'replacement snapshot actual deduction');
update order_bom_requirements set ingredient_quantity=5 where order_line_id='40000000-0000-0000-0000-000000000020' and ingredient_quantity=4;
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000020' and ingredient_id='10000000-0000-0000-0000-000000000001' and reversed_at is null),50,'updated import reconciles committed deduction');
-- Already committed no-op saves must not create new ledger revisions.
do $check$
declare before_count integer;
begin
  select count(*) into before_count from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000020';
  update order_package_choice_snapshots set is_selected=is_selected where order_line_id='40000000-0000-0000-0000-000000000020';
  perform pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000020'),before_count,'no-op committed option avoids ledger revisions');
end;
$check$;
-- Linking and unlinking imported choice rows invalidate the affected line.
do $check$
declare before_version bigint;
begin
  select version into before_version from private.material_line_versions where order_line_id='40000000-0000-0000-0000-000000000020';
  insert into order_package_choice_snapshots(id,order_id,is_selected) values ('92000000-0000-0000-0000-000000000020','30000000-0000-0000-0000-000000000020',false);
  update order_package_choice_snapshots set order_line_id='40000000-0000-0000-0000-000000000020' where id='92000000-0000-0000-0000-000000000020';
  perform pg_temp.assert_equal((select version from private.material_line_versions where order_line_id='40000000-0000-0000-0000-000000000020'),before_version+1,'link imported choice');
  update order_package_choice_snapshots set order_line_id=null where id='92000000-0000-0000-0000-000000000020';
  perform pg_temp.assert_equal((select version from private.material_line_versions where order_line_id='40000000-0000-0000-0000-000000000020'),before_version+2,'unlink imported choice');
  delete from order_package_choice_snapshots where id='92000000-0000-0000-0000-000000000020';
end;
$check$;
-- An unchanged write to old BOM rows must not revive them after a product change.
delete from order_package_choice_snapshots where order_line_id='40000000-0000-0000-0000-000000000020';
update order_lines set product_id='20000000-0000-0000-0000-000000000002',package_id=null where id='40000000-0000-0000-0000-000000000020';
update order_bom_requirements set ingredient_quantity=ingredient_quantity where order_line_id='40000000-0000-0000-0000-000000000020';
select pg_temp.assert_equal((select count(*) from private.catering_line_material_requirements('40000000-0000-0000-0000-000000000020')),0,'unchanged stale snapshot remains invalid');
select pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000020' and reversed_at is null),0,'stale no-op cannot re-deduct materials');

-- Forecast quantities use the material stocktake unit, not the BOM entry unit.
insert into ingredients(
  id,name,sku,product_unit,stocktake_unit,product_quantity,
  is_ingredient_stocktake,is_packing_stocktake
) values
  ('10000000-0000-0000-0000-000000000021','Test leaves','LEAF','克','kg',1000,true,false),
  ('10000000-0000-0000-0000-000000000022','Test container','BOX','個','個',1,false,true);
insert into products(id,name,sku) values
  ('20000000-0000-0000-0000-000000000021','Unit conversion meal','UNIT-MEAL');
insert into product_ingredients(product_id,ingredient_id,quantity) values
  ('20000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000021',300),
  ('20000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000022',1);
insert into orders(id,order_number,delivery_at) values
  ('30000000-0000-0000-0000-000000000021','UNIT-CONVERSION',current_date+3);
insert into order_lines(id,order_id,product_id,quantity) values
  ('40000000-0000-0000-0000-000000000021','30000000-0000-0000-0000-000000000021','20000000-0000-0000-0000-000000000021',1);
insert into deliveries(id,order_id,delivery_at,delivery_status) values
  ('50000000-0000-0000-0000-000000000021','30000000-0000-0000-0000-000000000021',current_date+3,'Pending');
set constraints all immediate;
select pg_temp.assert_equal(
  (select sum(calculated_quantity) from public.material_usage_forecast_lines(
    'ingredient',current_date,current_date+13
  ) where order_id='30000000-0000-0000-0000-000000000021'),
  0.3,
  '300 grams forecasts as 0.3 kg'
);
select pg_temp.assert_equal(
  (select sum(calculated_quantity) from public.material_usage_forecast_lines(
    'packing',current_date,current_date+13
  ) where order_id='30000000-0000-0000-0000-000000000021'),
  1,
  'one packing item forecasts as one item'
);
select pg_temp.assert_equal(
  (select (stocktake_unit='個' and product_quantity=1)::integer
   from ingredients where id='83a650ca-4ca8-4195-8562-a588c247dfd2'),
  1,
  '2L soup bucket is stocked and deducted by item'
);
rollback;
