begin;
update product_ingredients set quantity=2 where ingredient_id='10000000-0000-0000-0000-000000000001';
insert into orders(id,delivery_status,delivery_at) values ('30000000-0000-0000-0000-000000000060','待取貨',current_date+2);
insert into order_lines(id,order_id,product_id,quantity) values ('40000000-0000-0000-0000-000000000060','30000000-0000-0000-0000-000000000060','20000000-0000-0000-0000-000000000001',10);
insert into deliveries(id,order_id,delivery_status,delivery_at) values ('50000000-0000-0000-0000-000000000060','30000000-0000-0000-0000-000000000060','待取貨',current_date+2);
set constraints all immediate;
update deliveries set basic_fee=99,total_fee=120 where id='50000000-0000-0000-0000-000000000060';
insert into delivery_surcharges(delivery_id) values ('50000000-0000-0000-0000-000000000060');
do $check$ begin
  begin
    update deliveries set order_id=null where id='50000000-0000-0000-0000-000000000060';
    raise exception 'existing delivery cannot be orphaned';
  exception when check_violation then null;
  end;
  begin
    update order_lines set order_id=null where id='40000000-0000-0000-0000-000000000060';
    raise exception 'existing line cannot be orphaned';
  exception when check_violation then null;
  end;
end; $check$;
select public.cancel_pending_delivery('50000000-0000-0000-0000-000000000060');
select pg_temp.assert_equal((select count(*) from deliveries where id='50000000-0000-0000-0000-000000000060' and delivery_status='已取消'),1,'cancel API preserves delivery history');
select pg_temp.assert_equal((select total_fee from deliveries where id='50000000-0000-0000-0000-000000000060'),0,'cancelled fee excluded from totals');
select pg_temp.assert_equal((select count(*) from delivery_surcharges where delivery_id='50000000-0000-0000-0000-000000000060'),0,'cancel surcharge follows existing API');
select pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000060' and reversed_at is null),0,'cancel API reverses materials');
select public.cancel_pending_delivery('50000000-0000-0000-0000-000000000060');
set local test.jwt_role='';
do $check$ begin
  begin
    perform public.cancel_pending_delivery('50000000-0000-0000-0000-000000000060');
    raise exception 'missing role must not cancel delivery';
  exception when insufficient_privilege then null;
  end;
end; $check$;
rollback;

begin;
insert into orders(id,delivery_at) values ('30000000-0000-0000-0000-000000000061',current_date+2),('30000000-0000-0000-0000-000000000062',current_date+2);
insert into order_lines(id,order_id,product_id,quantity) values ('40000000-0000-0000-0000-000000000061','30000000-0000-0000-0000-000000000061','20000000-0000-0000-0000-000000000002',10),('40000000-0000-0000-0000-000000000062','30000000-0000-0000-0000-000000000062','20000000-0000-0000-0000-000000000002',10);
insert into order_bom_requirements(id,order_line_id,ingredient_id,ingredient_quantity) values ('a0000000-0000-0000-0000-000000000061','40000000-0000-0000-0000-000000000061','10000000-0000-0000-0000-000000000001',2);
insert into deliveries(order_id,delivery_at,delivery_status) values ('30000000-0000-0000-0000-000000000061',current_date+2,'待接單'),('30000000-0000-0000-0000-000000000062',current_date+2,'待接單');
set constraints all immediate;
update order_bom_requirements set order_id='30000000-0000-0000-0000-000000000062',order_line_id='40000000-0000-0000-0000-000000000062' where id='a0000000-0000-0000-0000-000000000061';
select pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000061' and reversed_at is null),0,'BOM move reverses old order');
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000062' and reversed_at is null),20,'BOM move deducts new order');
insert into order_list_manual_todos(order_id,todo_key) values ('30000000-0000-0000-0000-000000000062','cancelled');
update order_list_manual_todos set todo_key='monthly-settlement' where order_id='30000000-0000-0000-0000-000000000062';
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000062' and reversed_at is null),20,'renamed cancellation tag restores deduction');
rollback;

begin;
insert into orders(id,delivery_at) values ('30000000-0000-0000-0000-000000000063',current_date+2);
insert into order_lines(id,order_id,product_id,quantity,delivery_at) values ('40000000-0000-0000-0000-000000000063','30000000-0000-0000-0000-000000000063','20000000-0000-0000-0000-000000000001',10,current_date+3);
insert into deliveries(id,order_id,delivery_at,delivery_status) values ('50000000-0000-0000-0000-000000000063','30000000-0000-0000-0000-000000000063',current_date+2,'Pending'),('50000000-0000-0000-0000-000000000064','30000000-0000-0000-0000-000000000063',current_date+3,'Pending');
set constraints all immediate;
delete from deliveries where id='50000000-0000-0000-0000-000000000064';
select pg_temp.assert_equal((select count(*) from order_line_delivery_allocations where order_line_id='40000000-0000-0000-0000-000000000063' and delivery_id='50000000-0000-0000-0000-000000000063'),1,'deleting pending leg rebuilds allocation');
rollback;

-- Shared refresh dispatch must handle zero/restore, void/unvoid and document kind.
begin;
insert into orders(id,delivery_at) values ('30000000-0000-0000-0000-000000000065',current_date+2);
insert into order_lines(id,order_id,product_id,quantity) values ('40000000-0000-0000-0000-000000000065','30000000-0000-0000-0000-000000000065','20000000-0000-0000-0000-000000000002',10);
insert into order_bom_requirements(order_line_id,ingredient_id,ingredient_quantity) values ('40000000-0000-0000-0000-000000000065','10000000-0000-0000-0000-000000000001',2);
insert into deliveries(order_id,delivery_at,delivery_status) values ('30000000-0000-0000-0000-000000000065',current_date+2,'待接單');
set constraints all immediate;
update order_lines set quantity=0 where id='40000000-0000-0000-0000-000000000065';
select pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000065' and reversed_at is null),0,'zero quantity reverses consumption');
update order_lines set quantity=10 where id='40000000-0000-0000-0000-000000000065';
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000065' and reversed_at is null),20,'restored quantity restores consumption');
update order_lines set is_void=true where id='40000000-0000-0000-0000-000000000065';
select pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000065' and reversed_at is null),0,'void reverses consumption');
update order_lines set is_void=false where id='40000000-0000-0000-0000-000000000065';
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000065' and reversed_at is null),20,'unvoid restores consumption');
update orders set document_type='quote' where id='30000000-0000-0000-0000-000000000065';
select pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000065' and reversed_at is null),0,'quote does not consume');
update orders set document_type='order' where id='30000000-0000-0000-0000-000000000065';
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000065' and reversed_at is null),20,'document kind transition reconciles');
rollback;

-- A package choice correction also refreshes both fully linked orders.
begin;
update product_ingredients set quantity=2 where ingredient_id='10000000-0000-0000-0000-000000000001';
insert into orders(id,delivery_at) values ('30000000-0000-0000-0000-000000000066',current_date+2),('30000000-0000-0000-0000-000000000067',current_date+2);
insert into order_lines(id,order_id,package_id,quantity) values ('40000000-0000-0000-0000-000000000066','30000000-0000-0000-0000-000000000066','80000000-0000-0000-0000-000000000001',10),('40000000-0000-0000-0000-000000000067','30000000-0000-0000-0000-000000000067','80000000-0000-0000-0000-000000000001',10);
insert into order_package_choice_snapshots(id,order_id,order_line_id,package_product_id,is_selected) values ('a0000000-0000-0000-0000-000000000066','30000000-0000-0000-0000-000000000066','40000000-0000-0000-0000-000000000066','90000000-0000-0000-0000-000000000001',true);
insert into deliveries(order_id,delivery_at,delivery_status) values ('30000000-0000-0000-0000-000000000066',current_date+2,'待接單'),('30000000-0000-0000-0000-000000000067',current_date+2,'待接單');
set constraints all immediate;
update order_package_choice_snapshots set order_id='30000000-0000-0000-0000-000000000067',order_line_id='40000000-0000-0000-0000-000000000067' where id='a0000000-0000-0000-0000-000000000066';
select pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000066' and reversed_at is null),0,'choice move reverses old order');
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000067' and ingredient_id='10000000-0000-0000-0000-000000000001' and reversed_at is null),20,'choice move consumes new order');
rollback;
