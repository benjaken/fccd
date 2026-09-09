-- These rows predate the v2 ALTER TABLE; the test must not fake the flag later.
insert into ingredients(id,name,stocktake_unit) values ('10000000-0000-0000-0000-000000000070','Legacy flour','kg');
insert into ingredients(
  id,name,product_unit,stocktake_unit,product_quantity,
  is_ingredient_stocktake,is_packing_stocktake
) values (
  '83a650ca-4ca8-4195-8562-a588c247dfd2','塑料湯桶 連蓋 2L','個','箱',200,
  false,true
);
insert into products(id,name) values ('20000000-0000-0000-0000-000000000070','Legacy meal');
insert into product_ingredients(product_id,ingredient_id,quantity) values ('20000000-0000-0000-0000-000000000070','10000000-0000-0000-0000-000000000070',2);
insert into orders(id,delivery_at) values ('30000000-0000-0000-0000-000000000070',current_date+100);
insert into order_lines(id,order_id,product_id,quantity) values ('40000000-0000-0000-0000-000000000070','30000000-0000-0000-0000-000000000070','20000000-0000-0000-0000-000000000070',10);
insert into deliveries(id,order_id,delivery_at,delivery_status) values ('50000000-0000-0000-0000-000000000070','30000000-0000-0000-0000-000000000070',current_date+100,'Pending');
