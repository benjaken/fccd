begin;

insert into orders(id,order_number,delivery_at) values
  ('30000000-0000-0000-0000-000000000030','UTENSIL-DEMAND',current_date+2);
insert into order_lines(
  id,order_id,quantity,product_name_snapshot,content_snapshot
) values
  ('40000000-0000-0000-0000-000000000030','30000000-0000-0000-0000-000000000030',3,'餐具包 (6位)','餐具包 (6位)'),
  ('40000000-0000-0000-0000-000000000031','30000000-0000-0000-0000-000000000030',1,'飯盒餐具包 62份','飯盒餐具包 62份');
insert into deliveries(id,order_id,delivery_at,delivery_status) values
  ('50000000-0000-0000-0000-000000000030','30000000-0000-0000-0000-000000000030',current_date+2,'Pending');
set constraints all immediate;

select pg_temp.assert_equal(
  (select coalesce(sum(calculated_quantity),0)
   from public.material_usage_forecast_lines('packing',current_date,current_date+13)
   where order_id='30000000-0000-0000-0000-000000000030'
     and ingredient_id='c6621db1-b21f-4b62-b6cb-0aef12e34c01'),
  3,
  'standard six-person utensil lines deduct standard packs'
);

select pg_temp.assert_equal(
  (select coalesce(sum(calculated_quantity),0)
   from public.material_usage_forecast_lines('packing',current_date,current_date+13)
   where order_id='30000000-0000-0000-0000-000000000030'
     and ingredient_id='5346734a-df61-4d46-91ed-17db6985c5e6'),
  0.62,
  'lunch-box utensil lines convert sets into Chinese utensil packages'
);

update deliveries
set delivery_status='待接單'
where id='50000000-0000-0000-0000-000000000030';

select pg_temp.assert_equal(
  (select coalesce(sum(quantity),0)
   from order_material_consumptions
   where order_id='30000000-0000-0000-0000-000000000030'
     and ingredient_id='c6621db1-b21f-4b62-b6cb-0aef12e34c01'
     and reversed_at is null),
  3,
  'committed delivery deducts standard utensil packs'
);

select pg_temp.assert_equal(
  (select coalesce(sum(quantity),0)
   from order_material_consumptions
   where order_id='30000000-0000-0000-0000-000000000030'
     and ingredient_id='5346734a-df61-4d46-91ed-17db6985c5e6'
     and reversed_at is null),
  0.62,
  'committed delivery deducts converted Chinese utensil packages'
);

rollback;
