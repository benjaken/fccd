insert into ingredients(
  id,sku,name,description,product_unit,stocktake_unit,product_quantity,
  cost_per_product_unit,cost_per_stocktake_unit,
  is_ingredient_stocktake,is_packing_stocktake
) values (
  '9788c374-560e-4546-8c15-d0dc85a2d759','MF001',
  '有皮22片裝厚方包','一條',null,'條',22,2.5,55,true,false
);
insert into ingredient_stocktake_events(ingredient_id,quantity,stocktake_at)
values ('9788c374-560e-4546-8c15-d0dc85a2d759',3,current_date-2);
