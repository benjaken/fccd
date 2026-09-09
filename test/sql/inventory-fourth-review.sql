-- Fourth review: package replacement and pending-leg edits on committed orders.
begin;
update product_ingredients set quantity=2 where ingredient_id='10000000-0000-0000-0000-000000000001';
insert into orders(id,delivery_at) values ('30000000-0000-0000-0000-000000000030',current_date+2);
insert into products(id,name) values ('20000000-0000-0000-0000-000000000030','Replacement menu');
insert into product_ingredients(product_id,ingredient_id,quantity) values ('20000000-0000-0000-0000-000000000030','10000000-0000-0000-0000-000000000001',7);
insert into package_products(id,package_id,product_id,quantity,is_selected) values ('90000000-0000-0000-0000-000000000030','80000000-0000-0000-0000-000000000030','20000000-0000-0000-0000-000000000030',1,true);
insert into order_lines(id,order_id,package_id,quantity) values ('40000000-0000-0000-0000-000000000030','30000000-0000-0000-0000-000000000030','80000000-0000-0000-0000-000000000001',10);
insert into order_package_choice_snapshots(order_id,order_line_id,package_product_id,is_selected) values ('30000000-0000-0000-0000-000000000030','40000000-0000-0000-0000-000000000030','90000000-0000-0000-0000-000000000001',true);
insert into deliveries(order_id,delivery_at,delivery_status) values ('30000000-0000-0000-0000-000000000030',current_date+2,'待接單');
set constraints all immediate;
update order_lines set package_id='80000000-0000-0000-0000-000000000030' where id='40000000-0000-0000-0000-000000000030';
select pg_temp.assert_equal((select required_quantity from private.catering_line_material_requirements('40000000-0000-0000-0000-000000000030') where ingredient_id='10000000-0000-0000-0000-000000000001'),70,'replacement package uses current defaults');
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000030' and ingredient_id='10000000-0000-0000-0000-000000000001' and reversed_at is null),70,'replacement package reconciles deduction');
insert into order_package_choice_snapshots(order_line_id,package_id,is_selected) values ('40000000-0000-0000-0000-000000000030','80000000-0000-0000-0000-000000000030',true);
select pg_temp.assert_equal(private.catering_line_material_is_unmapped('40000000-0000-0000-0000-000000000030')::integer,1,'current unresolved option warns instead of using defaults');
update order_lines set package_id=null,product_id='20000000-0000-0000-0000-000000000002' where id='40000000-0000-0000-0000-000000000030';
select pg_temp.assert_equal((select count(*) from private.catering_line_material_requirements('40000000-0000-0000-0000-000000000030')),0,'product replacement ignores old choices');
select pg_temp.assert_equal(private.catering_line_material_is_unmapped('40000000-0000-0000-0000-000000000030')::integer,1,'product replacement missing recipe warns');
rollback;
begin;
update product_ingredients set quantity=2 where ingredient_id='10000000-0000-0000-0000-000000000001';
insert into orders(id,delivery_at) values ('30000000-0000-0000-0000-000000000031',current_date+2);
insert into order_lines(id,order_id,product_id,quantity,delivery_at) values ('40000000-0000-0000-0000-000000000031','30000000-0000-0000-0000-000000000031','20000000-0000-0000-0000-000000000001',10,current_date+2);
insert into deliveries(id,order_id,delivery_at,delivery_status) values
('50000000-0000-0000-0000-000000000031','30000000-0000-0000-0000-000000000031',current_date+2,'Pending'),
('50000000-0000-0000-0000-000000000032','30000000-0000-0000-0000-000000000031',current_date+3,'Pending');
set constraints all immediate;
update deliveries set delivery_status='待接單' where id='50000000-0000-0000-0000-000000000031';
do $check$ begin
  begin
    update deliveries set delivery_at=current_date+2 where id='50000000-0000-0000-0000-000000000032';
    raise exception 'expected ambiguous pending leg edit to fail';
  exception when check_violation then null;
  end;
  begin
    insert into deliveries(order_id,delivery_at,delivery_status) values ('30000000-0000-0000-0000-000000000031',current_date+2,'Pending');
    raise exception 'expected ambiguous pending leg insertion to fail';
  exception when check_violation then null;
  end;
end; $check$;
select pg_temp.assert_equal((select sum(allocated_quantity) from order_line_delivery_allocations where order_line_id='40000000-0000-0000-0000-000000000031'),10,'failed pending edits preserve allocations');
select pg_temp.assert_equal((select count(*) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000031' and reversed_at is null),2,'failed pending edits preserve consumption');
select pg_temp.assert_equal((select sum(quantity) from order_material_consumptions where order_id='30000000-0000-0000-0000-000000000031' and ingredient_id='10000000-0000-0000-0000-000000000001' and reversed_at is null),20,'failed pending edits preserve 20kg');
update deliveries set delivery_at=current_date+4 where id='50000000-0000-0000-0000-000000000032';
select pg_temp.assert_equal((select sum(allocated_quantity) from order_line_delivery_allocations where order_line_id='40000000-0000-0000-0000-000000000031'),10,'valid pending date edit keeps allocation');
rollback;
