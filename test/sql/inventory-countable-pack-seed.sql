insert into ingredients(
  id,sku,name,description,product_unit,stocktake_unit,product_quantity,
  cost_per_product_unit,cost_per_stocktake_unit,
  is_ingredient_stocktake,is_packing_stocktake
) values (
  '41be0a73-850b-45d6-8f72-42ec107e3992','AM004',
  '迷你原味香腸 7-8cm 20包/箱','20條/20包/箱','條','包',20,1.7,34,true,false
);
insert into ingredient_stocktake_events(ingredient_id,quantity,stocktake_at)
values ('41be0a73-850b-45d6-8f72-42ec107e3992',15,current_date-2);
