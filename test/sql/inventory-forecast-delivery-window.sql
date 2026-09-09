begin;

insert into products(id,name,sku) values
  ('20000000-0000-0000-0000-000000000090','Forecast sausage bento','CBET02-F');
insert into product_ingredients(product_id,ingredient_id,quantity) values
  ('20000000-0000-0000-0000-000000000090','41be0a73-850b-45d6-8f72-42ec107e3992',1);
insert into orders(id,order_number,delivery_at) values
  ('30000000-0000-0000-0000-000000000090','F-14DAY',
   timestamptz '2026-09-20 16:00:00+00');
insert into order_lines(id,order_id,product_id,quantity) values
  ('40000000-0000-0000-0000-000000000090','30000000-0000-0000-0000-000000000090',
   '20000000-0000-0000-0000-000000000090',7);
insert into deliveries(id,order_id,delivery_at,delivery_status) values
  ('50000000-0000-0000-0000-000000000090','30000000-0000-0000-0000-000000000090',
   timestamptz '2026-09-20 16:00:00+00','Pending');
update deliveries
set delivery_status='待接單'
where id='50000000-0000-0000-0000-000000000090';
set constraints all immediate;

select pg_temp.assert_equal(
  (select required_stock from private.inventory_demand_lines(
    date '2026-09-09', 14
  ) where item_id='41be0a73-850b-45d6-8f72-42ec107e3992'
    and source_order_id='30000000-0000-0000-0000-000000000090'),
  0.35,
  'future committed sausage legs stay in the 14-day forecast until delivery'
);

update order_material_consumptions
set consumed_at = timestamptz '2026-09-08 16:00:00+00'
where order_id='30000000-0000-0000-0000-000000000090'
  and reversed_at is null;

select pg_temp.assert_equal(
  (select count(*) from private.inventory_demand_lines(
    date '2026-09-09', 14
  ) where source_order_id='30000000-0000-0000-0000-000000000090'),
  0,
  'already-consumed committed legs are not forecast again'
);

rollback;
