begin;
set constraints all immediate;
select pg_temp.assert_equal((select material_commitment_v2::integer from orders where id='30000000-0000-0000-0000-000000000070'),0,'real pre-migration order remains legacy');
update deliveries set delivery_status='待取貨' where id='50000000-0000-0000-0000-000000000070';
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000070' and reversed_at is null),20,'legacy pending order still deducts');
update deliveries set delivery_status='已送達',fulfilled_at=now() where id='50000000-0000-0000-0000-000000000070';
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000070' and reversed_at is null),20,'legacy status retry is idempotent');
select pg_temp.assert_equal((select count(*) from private.inventory_demand_lines(current_date+99,14) where source_order_id='30000000-0000-0000-0000-000000000070'),0,'legacy committed materials no longer forecast');
-- Seed the real accounting boundary: old consumption precedes a newer stocktake.
update order_material_consumptions set consumed_at=now()-interval '2 days' where order_id='30000000-0000-0000-0000-000000000070' and reversed_at is null;
update deliveries set fulfilled_at=now()-interval '2 days' where id='50000000-0000-0000-0000-000000000070';
insert into ingredient_stocktake_events(ingredient_id,quantity,stocktake_at) values ('10000000-0000-0000-0000-000000000070',100,now()-interval '1 day');
insert into order_list_manual_todos(order_id,todo_key) values ('30000000-0000-0000-0000-000000000070','cancelled');
delete from order_list_manual_todos where order_id='30000000-0000-0000-0000-000000000070';
select pg_temp.assert_equal(private.material_inventory_current_balance('ingredient','10000000-0000-0000-0000-000000000070'),100,'legacy reopen after stocktake keeps balance');
update deliveries set delivery_status='已取消' where id='50000000-0000-0000-0000-000000000070';
select pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000070' and reversed_at is null),0,'legacy cancellation returns materials');
rollback;
