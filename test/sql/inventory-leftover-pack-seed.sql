-- Leftover countable packs the first restore list missed (串/塊/pc).
insert into ingredients(
  id,sku,name,description,product_unit,stocktake_unit,product_quantity,
  cost_per_product_unit,cost_per_stocktake_unit,
  is_ingredient_stocktake,is_packing_stocktake
) values
  ('faf2c049-9c34-441d-9c98-1352b0ab2e54','OFE002',
   '亞洲廚沙嗲牛柳肉 18包/箱','24串/18包/箱','串','包',24,4.625,111,true,false),
  ('eb77c361-6e6b-4eb1-b9ac-db4c33131afa','OFE003',
   '鮮肉棒棒餃子 25g 4盒/箱','100pc/4盒/箱','件','盒',100,1.7475,174.75,true,false),
  ('0783bd46-7f7b-4313-8765-0e5a6d2e1f3e','MFL001',
   '4支牛仔(4支/包,4包/箱) ','4支/包，4包/箱','支','包',4,10,40,true,false),
  ('5f53a84d-fbac-4162-a44f-e2511afbb7ef','AM001',
   '(醬燒)炭烤精選四式雞串 30g 20包/箱','8串/20包/箱','串','包',8,3,24,true,false),
  ('648cf73e-feff-4a39-b4dc-403c6739fad4','G001',
   '牛油卷包 40 克','9個/包','個','包',9,2.25,20.25,true,false);

insert into ingredient_stocktake_events(ingredient_id,quantity,stocktake_at) values
  ('faf2c049-9c34-441d-9c98-1352b0ab2e54',12,current_date-2),
  ('eb77c361-6e6b-4eb1-b9ac-db4c33131afa',6,current_date-2),
  ('0783bd46-7f7b-4313-8765-0e5a6d2e1f3e',8,current_date-2),
  ('5f53a84d-fbac-4162-a44f-e2511afbb7ef',13,current_date-2);
