-- Long usage ranges must include both catering and restaurant demand at day 40.
update deliveries set delivery_at=(current_date+40)::timestamp at time zone 'Asia/Hong_Kong'
where id='50000000-0000-0000-0000-000000000003';
update shop_order_requests set delivery_date=current_date+40;
select pg_temp.assert_equal((select sum(calculated_quantity) from material_usage_forecast_lines('ingredient',current_date,current_date+45) where order_id in ('30000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001')),110,'long usage range');

-- Missing recipes follow the actual pending leg, not the old order-line date.
update order_lines set product_id='20000000-0000-0000-0000-000000000002', delivery_at=current_date-10
where id='40000000-0000-0000-0000-000000000002';
update deliveries set delivery_at=(current_date+1)::timestamp at time zone 'Asia/Hong_Kong'
where id='50000000-0000-0000-0000-000000000003';
select pg_temp.assert_equal((select unmapped_line_count from inventory_forecast_order_shortages(current_date,14) where order_id='30000000-0000-0000-0000-000000000002'),1,'split date missing recipe');
select pg_temp.assert_equal((select count(*) from inventory_forecast_unmapped_order_lines(current_date,14) where order_number='NEW-2'),1,'email missing recipe');
update deliveries set delivery_status='已取消' where id='50000000-0000-0000-0000-000000000003';
select pg_temp.assert_equal((select count(*) from inventory_forecast_order_shortages(current_date,14) where order_id='30000000-0000-0000-0000-000000000002'),0,'cancelled leg no warning');

-- Round cumulative material shares, never each leg independently.
update product_ingredients set quantity=0.001 where ingredient_id='10000000-0000-0000-0000-000000000001';
begin;
insert into orders(id,delivery_at) values ('30000000-0000-0000-0000-000000000009',current_date+7);
insert into order_lines(id,order_id,product_id,quantity) values
('40000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001',1);
insert into deliveries(id,order_id,delivery_at,delivery_status) values
('50000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000009',current_date+7,'Pending'),
('50000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000009',current_date+8,'Pending');
commit;
select set_order_delivery_allocations('30000000-0000-0000-0000-000000000009','[{"order_line_id":"40000000-0000-0000-0000-000000000009","allocations":[{"delivery_id":"50000000-0000-0000-0000-000000000009","quantity":0.5},{"delivery_id":"50000000-0000-0000-0000-000000000010","quantity":0.5}]}]');
select pg_temp.assert_equal((select sum(required_stock) from private.inventory_demand_lines(current_date,14) where source_order_id='30000000-0000-0000-0000-000000000009' and item_id='10000000-0000-0000-0000-000000000001'),0.001,'split material forecast');
update deliveries set delivery_status='待接單' where order_id='30000000-0000-0000-0000-000000000009';
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000009' and ingredient_id='10000000-0000-0000-0000-000000000001' and reversed_at is null),0.001,'split material deduction');
update deliveries set delivery_status='已取消' where id='50000000-0000-0000-0000-000000000009';
select pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000009' and ingredient_id='10000000-0000-0000-0000-000000000001' and reversed_at is null),0,'cancel does not move rounding remainder');
