-- These rows predate the v2 ALTER TABLE; the test must not fake the flag later.
insert into ingredients(id,name,stocktake_unit) values ('10000000-0000-0000-0000-000000000070','Legacy flour','kg');
insert into ingredients(
  id,name,description,product_unit,stocktake_unit,product_quantity,
  cost_per_product_unit,cost_per_stocktake_unit,
  is_ingredient_stocktake,is_packing_stocktake
) values
  ('fc4cdae7-24b2-433f-8026-2133cc652d27','500ml 甜品杯',null,'個','箱',100,0.96,96,false,true),
  ('55255419-1471-4b6b-ac80-9518c686dfd0','300ml 甜品杯',null,'個','箱',20,0.85,17,false,true),
  ('dfe98feb-c67d-4df0-b53f-38062380eedb','酒精 (1小時)',null,'個','箱',36,2.1111,76,false,true),
  ('b186e205-2a0c-4121-8f33-caea80d6e0d2','粟米片','190g x 8包/箱','包','箱',8,18,144,false,true),
  ('83a650ca-4ca8-4195-8562-a588c247dfd2','塑料湯桶 連蓋 2L',null,'個','箱',200,5.26,1052,false,true);
insert into packing_stocktake_events(ingredient_id,quantity,stocktake_at) values
  ('fc4cdae7-24b2-433f-8026-2133cc652d27',80,current_date-2),
  ('55255419-1471-4b6b-ac80-9518c686dfd0',50,current_date-2),
  ('dfe98feb-c67d-4df0-b53f-38062380eedb',10,current_date-2),
  ('b186e205-2a0c-4121-8f33-caea80d6e0d2',3,current_date-2),
  ('83a650ca-4ca8-4195-8562-a588c247dfd2',50,current_date-2);
insert into products(id,name) values ('20000000-0000-0000-0000-000000000070','Legacy meal');
insert into product_ingredients(product_id,ingredient_id,quantity) values ('20000000-0000-0000-0000-000000000070','10000000-0000-0000-0000-000000000070',2);
insert into orders(id,delivery_at) values ('30000000-0000-0000-0000-000000000070',current_date+100);
insert into order_lines(id,order_id,product_id,quantity) values ('40000000-0000-0000-0000-000000000070','30000000-0000-0000-0000-000000000070','20000000-0000-0000-0000-000000000070',10);
insert into deliveries(id,order_id,delivery_at,delivery_status) values ('50000000-0000-0000-0000-000000000070','30000000-0000-0000-0000-000000000070',current_date+100,'Pending');
