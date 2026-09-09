-- Simulate a legacy committed order whose utensil consumption was recorded
-- before six-person packs started deducting six individual settings.
insert into orders(
  id,order_number,delivery_at,material_commitment_v2
) values (
  '30000000-0000-0000-0000-000000000033','LEGACY-UTENSIL',current_date+4,false
);
insert into order_lines(
  id,order_id,quantity,product_name_snapshot,content_snapshot
) values (
  '40000000-0000-0000-0000-000000000033','30000000-0000-0000-0000-000000000033',2,
  '餐具包 (6位)','餐具包 (6位)'
);
insert into deliveries(
  id,order_id,delivery_at,delivery_status
) values (
  '50000000-0000-0000-0000-000000000033','30000000-0000-0000-0000-000000000033',
  current_date+4,'待接單'
);
set constraints all immediate;

update order_material_consumptions
set quantity=2
where order_id='30000000-0000-0000-0000-000000000033'
  and ingredient_id='c6621db1-b21f-4b62-b6cb-0aef12e34c01'
  and reversed_at is null;
