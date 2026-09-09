\set ON_ERROR_STOP on
-- Assertions execute against PostgreSQL using the real migration functions.
create function pg_temp.assert_equal(actual numeric, expected numeric, label text)
returns void language plpgsql as $$ begin
  if actual is distinct from expected then
    raise exception '%: expected %, got %',label,expected,actual;
  end if;
end; $$;

insert into ingredients(id,name,sku,stocktake_unit) values ('10000000-0000-0000-0000-000000000001','Flour','FLOUR','kg');
insert into ingredients(id,name,sku,stocktake_unit,is_ingredient_stocktake,is_packing_stocktake)
values ('10000000-0000-0000-0000-000000000002','Box','BOX','unit',false,true);
insert into products(id,name) values ('20000000-0000-0000-0000-000000000001','Meal');
insert into product_ingredients(product_id,ingredient_id,quantity) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',2),
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',1);
insert into ingredient_stocktake_events(ingredient_id,quantity,stocktake_at)
values ('10000000-0000-0000-0000-000000000001',100,now()-interval '1 day');
insert into packing_stocktake_events(ingredient_id,quantity,stocktake_at)
values ('10000000-0000-0000-0000-000000000002',100,now()-interval '1 day');

-- Single leg auto assignment, snapshot scaling and fallback for missing packing.
begin;
insert into orders(id,order_number,delivery_at) values ('30000000-0000-0000-0000-000000000001','NEW-1',current_date+2);
insert into order_lines(id,order_id,product_id,quantity) values
('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',10);
insert into order_bom_requirements(order_id,order_line_id,ingredient_id,calculated_quantity,product_quantity)
values ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',20,10);
insert into deliveries(id,order_id,delivery_at,delivery_status) values
('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date+2,'Pending');
commit;
select pg_temp.assert_equal((select sum(allocated_quantity) from order_line_delivery_allocations),10,'automatic assignment');
select pg_temp.assert_equal((select sum(required_stock) from private.inventory_demand_lines(current_date,14) where item_id='10000000-0000-0000-0000-000000000002'),10,'packing fallback');

-- Explicit 4/6 split across two legs and awaiting-driver exact-once deduction.
insert into deliveries(id,order_id,delivery_at,delivery_status) values
('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',current_date+3,'Pending');
select set_order_delivery_allocations('30000000-0000-0000-0000-000000000001',
'[{"order_line_id":"40000000-0000-0000-0000-000000000001","allocations":[{"delivery_id":"50000000-0000-0000-0000-000000000001","quantity":4},{"delivery_id":"50000000-0000-0000-0000-000000000002","quantity":6}]}]');
update deliveries set delivery_status='待接單' where id='50000000-0000-0000-0000-000000000001';
select pg_temp.assert_equal(private.material_inventory_current_balance('ingredient','10000000-0000-0000-0000-000000000001'),92,'first leg only');
select pg_temp.assert_equal((select sum(required_stock) from private.inventory_demand_lines(current_date,14) where item_id='10000000-0000-0000-0000-000000000001'),12,'second leg remains forecast');
update deliveries set delivery_status='待取貨' where id='50000000-0000-0000-0000-000000000001';
select pg_temp.assert_equal((select count(*) from order_material_consumptions),2,'status retry creates no new ledger');
update deliveries set delivery_status='待接單' where id='50000000-0000-0000-0000-000000000002';
select pg_temp.assert_equal(private.material_inventory_current_balance('ingredient','10000000-0000-0000-0000-000000000001'),80,'second leg deducts');
select pg_temp.assert_equal((select count(*) from private.inventory_demand_lines(current_date,14)),0,'committed not forecast again');

-- Quantity edit rescales explicit splits and recalculates snapshots atomically.
update order_lines set quantity=20 where id='40000000-0000-0000-0000-000000000001';
select pg_temp.assert_equal(private.material_inventory_current_balance('ingredient','10000000-0000-0000-0000-000000000001'),60,'quantity edit net deduction');
select pg_temp.assert_equal((select sum(allocated_quantity) from order_line_delivery_allocations),20,'quantity edit allocation total');
select pg_temp.assert_equal((select count(*) from order_material_consumptions where reversed_at is not null),6,'old deductions auditable');

-- One cancelled leg returns only its committed materials.
update deliveries set delivery_status='已取消' where id='50000000-0000-0000-0000-000000000002';
select pg_temp.assert_equal(private.material_inventory_current_balance('ingredient','10000000-0000-0000-0000-000000000001'),84,'cancel second leg');
insert into order_list_manual_todos(order_id,todo_key) values ('30000000-0000-0000-0000-000000000001','cancelled');
select pg_temp.assert_equal(private.material_inventory_current_balance('ingredient','10000000-0000-0000-0000-000000000001'),100,'cancel entire order');
select pg_temp.assert_equal((select count(*) from private.inventory_demand_lines(current_date,14)),0,'cancelled absent from forecast');

-- The restaurant request must be ahead of the later catering order in allocation.
begin;
insert into orders(id,order_number,delivery_at) values ('30000000-0000-0000-0000-000000000002','NEW-2',current_date+4);
insert into order_lines(id,order_id,product_id,quantity) values
('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',15);
insert into deliveries(id,order_id,delivery_at,delivery_status) values
('50000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002',current_date+4,'Pending');
insert into shop_catalog_items(id,ingredient_id,name,unit,stocktake_kind,warehouse) values
('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Flour','kg','ingredient','dry');
insert into shop_order_requests(id,request_no,channel,status,delivery_date) values
('70000000-0000-0000-0000-000000000001','R-1','fc_internal','submitted',current_date+1);
insert into shop_order_lines(request_id,catalog_item_id,quantity,name) values
('70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',80,'Flour');
commit;
select pg_temp.assert_equal((select required_stock from inventory_forecast_shortages(current_date,14) where item_id='10000000-0000-0000-0000-000000000001'),110,'combined restaurant and catering demand');
select pg_temp.assert_equal((select (shortage_items->0->>'shortageQuantity')::numeric from inventory_forecast_order_shortages(current_date,14) where order_id='30000000-0000-0000-0000-000000000002'),10,'restaurant causes later catering shortfall');
select pg_temp.assert_equal((select sum(calculated_quantity) from material_usage_forecast_lines('ingredient',current_date,current_date+13)),110,'usage screen shares demand');

-- No arbitrary assignment when two deliveries match. Reject commitment.
begin;
insert into orders(id,delivery_at) values ('30000000-0000-0000-0000-000000000003',current_date+5);
insert into order_lines(id,order_id,product_id,quantity) values
('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',10);
insert into deliveries(order_id,delivery_at,delivery_status) values
('30000000-0000-0000-0000-000000000003',current_date+5,'Pending'),
('30000000-0000-0000-0000-000000000003',current_date+5,'Pending');
commit;
do $$ begin
  begin
    update deliveries set delivery_status='待接單' where order_id='30000000-0000-0000-0000-000000000003';
    set constraints all immediate;
    raise exception 'expected allocation validation';
  exception when check_violation then null;
  end;
end; $$;

-- Unauthorized allocation cannot mutate any quantity.
set test.authorized='false';
do $$ begin
  begin
    perform public.set_order_delivery_allocations('30000000-0000-0000-0000-000000000002','[]');
    raise exception 'expected permission denial';
  exception when insufficient_privilege then null;
  end;
end; $$;
set test.authorized='true';

-- Both reversal and deduction are visible in the existing ledger interface.
select pg_temp.assert_equal((select count(*) from material_inventory_ledger('ingredient','10000000-0000-0000-0000-000000000001') where movement_type='adjustment' and quantity > 0),
  (select count(*) from order_material_consumptions where ingredient_id='10000000-0000-0000-0000-000000000001' and reversed_at is not null), 'reversal ledger entries');
-- Tiny quantities must remain splittable after scaling without zero rows.
update order_lines set quantity=0.001 where id='40000000-0000-0000-0000-000000000001';
select pg_temp.assert_equal((select sum(allocated_quantity) from order_line_delivery_allocations where order_line_id='40000000-0000-0000-0000-000000000001'),0.001,'small split total');

-- Product edits must not treat an invalidated old snapshot as usable mapping.
insert into products(id,name) values ('20000000-0000-0000-0000-000000000002','Unmapped replacement');
update order_lines set product_id='20000000-0000-0000-0000-000000000002'
where id='40000000-0000-0000-0000-000000000001';
select pg_temp.assert_equal(private.catering_line_material_is_unmapped('40000000-0000-0000-0000-000000000001')::integer,1,'invalid snapshot cannot hide unmapped product');

-- Date-only restaurant deliveries reserve stock before catering on that date.
update deliveries set delivery_at=((current_date+1)::timestamp at time zone 'Asia/Hong_Kong')
where id='50000000-0000-0000-0000-000000000003';
select pg_temp.assert_equal((select (shortage_items->0->>'shortageQuantity')::numeric from inventory_forecast_order_shortages(current_date,14) where order_id='30000000-0000-0000-0000-000000000002'),10,'same-date restaurant priority');
-- Adding a package option after commitment must replace the old snapshot.
begin;
insert into orders(id,delivery_at) values ('30000000-0000-0000-0000-000000000004',current_date+6);
insert into order_lines(id,order_id,package_id,quantity) values
('40000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000001',1);
insert into order_bom_requirements(order_id,order_line_id,ingredient_id,calculated_quantity,product_quantity)
values ('30000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001',7,1);
insert into deliveries(order_id,delivery_at,delivery_status) values
('30000000-0000-0000-0000-000000000004',current_date+6,'待接單');
commit;
insert into package_products(id,package_id,product_id,quantity,is_selected) values
('90000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,false);
insert into order_package_choice_snapshots(order_id,order_line_id,package_product_id,is_selected) values
('30000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000004','90000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_equal((select quantity from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000004' and ingredient_id='10000000-0000-0000-0000-000000000001' and reversed_at is null),2,'inserted option invalidates old snapshot');
update orders set merged_into_order_id='30000000-0000-0000-0000-000000000002' where id='30000000-0000-0000-0000-000000000004';
select pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000004' and reversed_at is null),0,'merged order reversed');
select 'Inventory behaviour assertions passed' as result;
