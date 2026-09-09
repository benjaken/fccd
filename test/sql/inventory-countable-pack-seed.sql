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

insert into ingredients(
  id,sku,name,description,product_unit,stocktake_unit,product_quantity,
  cost_per_product_unit,cost_per_stocktake_unit,
  is_ingredient_stocktake,is_packing_stocktake
) values
  ('c1795f8a-f3e2-41a9-8418-c35fb1eefca8','AW001',
   'HOLEKI 布朗尼蛋糕','220件/盒','件','盒',220,1.6,352,true,false),
  ('36d4be5b-7ea1-4630-9003-c05a07e1bf88','AF003',
   '忌廉蟹肉薯餅 40g 8包/箱','15塊/8包/箱','塊','包',15,1.9833,29.75,false,false),
  ('7a32395e-b91c-48cf-92a3-57e874fe4788','OFE001',
   '亞洲廚沙嗲豬肉串 18包/箱','24串/18包/箱',null,'包',24,3.9333,94.4,true,false),
  ('dcad7ea7-6a27-41df-acdc-0daa38188393','TW001',
   '急凍肉丸 0.5oz 2包/箱','2.27kg/2包/箱',null,'包',160,1.7813,285,true,false),
  ('9c756f7b-8e95-4f61-b878-d3ceb8b6b9a4',null,
   '伊麵','10個/條','個','條',10,6,60,true,false),
  ('82dffd23-21ea-4549-8ce1-94b4e60f0a2e','GM002',
   'OMNI 新肉絲 (650g 大包裝) 20包/箱','650g/20包/箱','克','包',650,0.0646,42,true,false);

insert into ingredient_stocktake_events(ingredient_id,quantity,stocktake_at) values
  ('c1795f8a-f3e2-41a9-8418-c35fb1eefca8',1,current_date-20),
  ('c1795f8a-f3e2-41a9-8418-c35fb1eefca8',2,current_date-10),
  ('c1795f8a-f3e2-41a9-8418-c35fb1eefca8',550,current_date-5),
  ('36d4be5b-7ea1-4630-9003-c05a07e1bf88',4,current_date-2),
  ('7a32395e-b91c-48cf-92a3-57e874fe4788',3,current_date-2),
  ('dcad7ea7-6a27-41df-acdc-0daa38188393',2,current_date-2),
  ('9c756f7b-8e95-4f61-b878-d3ceb8b6b9a4',3,current_date-2),
  ('82dffd23-21ea-4549-8ce1-94b4e60f0a2e',6,current_date-2);
