# Production Bubble 全量数据分析报告

> 本报告由 production Data API 的 Git-ignored 本地导出生成。
> 报告仅提交聚合统计与 Bubble ID 对账样本，不提交原始业务记录。

## 1. 执行摘要

- Production Swagger 实体：98
- 快照时间：2026-08-12T02:39:34.000Z
- 已导出类型：98
- 当前可读取来源记录：377,116
- 本地导出记录：377,116
- 尚未导出记录：0
- API／Manifest 错误：0
- 重复 Bubble `_id`：0
- 显式关系字段：144
- 实际 primitive type 不符字段：0

## 2. 类型与导出完整性

| Bubble 类型 | 当前来源 | Manifest | 本地记录 | 完成率 | 字段 | 有值字段 | 重复 ID |
|---|---:|---:|---:|---:|---:|---:|---:|
| `a_customers` | 0 | 0 | 0 | 100.0% | 11 | 0 | 0 |
| `a_label` | 7,252 | 7,252 | 7,252 | 100.0% | 9 | 7 | 0 |
| `a_order` | 5,922 | 5,922 | 5,922 | 100.0% | 65 | 61 | 0 |
| `a_packages` | 175 | 175 | 175 | 100.0% | 14 | 11 | 0 |
| `a_products` | 8,302 | 8,302 | 8,302 | 100.0% | 27 | 21 | 0 |
| `b_adscostweekly` | 1,265 | 1,265 | 1,265 | 100.0% | 12 | 11 | 0 |
| `b_costmonthly` | 1,408 | 1,408 | 1,408 | 100.0% | 15 | 14 | 0 |
| `b_deliveryschedule` | 3,048 | 3,048 | 3,048 | 100.0% | 19 | 18 | 0 |
| `b_deliveryschedule_surcharge` | 1,560 | 1,560 | 1,560 | 100.0% | 8 | 7 | 0 |
| `b_product_ingredients` | 79,908 | 79,908 | 79,908 | 100.0% | 13 | 12 | 0 |
| `b_supplierpurchase` | 9,988 | 9,988 | 9,988 | 100.0% | 9 | 8 | 0 |
| `bento_mainingredients` | 8 | 8 | 8 | 100.0% | 6 | 5 | 0 |
| `bento_maintype` | 6 | 6 | 6 | 100.0% | 6 | 5 | 0 |
| `bento_numberofcolumn` | 4 | 4 | 4 | 100.0% | 6 | 5 | 0 |
| `bento_specialrequest` | 9 | 9 | 9 | 100.0% | 6 | 5 | 0 |
| `cal_control` | 1,844 | 1,844 | 1,844 | 100.0% | 8 | 6 | 0 |
| `cal_package_choice` | 1,503 | 1,503 | 1,503 | 100.0% | 13 | 11 | 0 |
| `ds__ingredient_supplier` | 66 | 66 | 66 | 100.0% | 12 | 9 | 0 |
| `ds_bento_additionalitem` | 5 | 5 | 5 | 100.0% | 6 | 5 | 0 |
| `ds_bento_eventpart` | 1 | 1 | 1 | 100.0% | 6 | 5 | 0 |
| `ds_channel` | 8 | 8 | 8 | 100.0% | 13 | 12 | 0 |
| `ds_collection` | 56 | 56 | 56 | 100.0% | 8 | 7 | 0 |
| `ds_cooktype` | 6 | 6 | 6 | 100.0% | 7 | 6 | 0 |
| `ds_cost_type` | 12 | 12 | 12 | 100.0% | 9 | 8 | 0 |
| `ds_customer_tag` | 1 | 1 | 1 | 100.0% | 8 | 7 | 0 |
| `ds_customer_tag_type` | 1 | 1 | 1 | 100.0% | 7 | 6 | 0 |
| `ds_deliverydistrict` | 314 | 314 | 314 | 100.0% | 8 | 7 | 0 |
| `ds_deliverysurcharge` | 4 | 4 | 4 | 100.0% | 7 | 6 | 0 |
| `ds_festival` | 6 | 6 | 6 | 100.0% | 7 | 6 | 0 |
| `ds_ingredients` | 317 | 317 | 317 | 100.0% | 18 | 17 | 0 |
| `ds_packing` | 0 | 0 | 0 | 100.0% | 6 | 0 | 0 |
| `ds_paymentmethod` | 17 | 17 | 17 | 100.0% | 8 | 7 | 0 |
| `ds_purchasetype` | 3 | 3 | 3 | 100.0% | 7 | 6 | 0 |
| `ds_quote_delivery` | 14 | 14 | 14 | 100.0% | 6 | 5 | 0 |
| `ds_quote_payment` | 5 | 5 | 5 | 100.0% | 7 | 6 | 0 |
| `ds_quote_t&c` | 16 | 16 | 16 | 100.0% | 7 | 6 | 0 |
| `ds_salespartner` | 5 | 5 | 5 | 100.0% | 8 | 7 | 0 |
| `ds_shippingmethod` | 6 | 6 | 6 | 100.0% | 13 | 12 | 0 |
| `ds_status` | 12 | 12 | 12 | 100.0% | 10 | 9 | 0 |
| `ds_super_motorcade` | 5 | 5 | 5 | 100.0% | 13 | 12 | 0 |
| `ds_super_motorcade_subdriver` | 31 | 31 | 31 | 100.0% | 8 | 7 | 0 |
| `ds_tags` | 0 | 0 | 0 | 100.0% | 6 | 0 | 0 |
| `ds_type` | 47 | 47 | 47 | 100.0% | 8 | 7 | 0 |
| `dsao_blockdate` | 18 | 18 | 18 | 100.0% | 6 | 5 | 0 |
| `dsaoproduct` | 15 | 15 | 15 | 100.0% | 7 | 6 | 0 |
| `dscommuchannels(quote)` | 3 | 3 | 3 | 100.0% | 7 | 6 | 0 |
| `dsreminderperson(first)` | 3 | 3 | 3 | 100.0% | 8 | 7 | 0 |
| `dsreminderperson(second)` | 2 | 2 | 2 | 100.0% | 8 | 6 | 0 |
| `dssourceofsales(quote)` | 3 | 3 | 3 | 100.0% | 7 | 6 | 0 |
| `m_cal_to_kg` | 4 | 4 | 4 | 100.0% | 7 | 6 | 0 |
| `m_calculation%` | 1 | 1 | 1 | 100.0% | 8 | 7 | 0 |
| `m_customer` | 4 | 4 | 4 | 100.0% | 11 | 10 | 0 |
| `m_donemeat` | 29 | 29 | 29 | 100.0% | 13 | 12 | 0 |
| `m_donemeat_stock` | 11,263 | 11,263 | 11,263 | 100.0% | 15 | 13 | 0 |
| `m_meatseasoning_cost` | 645 | 645 | 645 | 100.0% | 15 | 14 | 0 |
| `m_monthly_meatprice` | 646 | 646 | 646 | 100.0% | 9 | 8 | 0 |
| `m_outdone_donemeat` | 9,823 | 9,823 | 9,823 | 100.0% | 11 | 10 | 0 |
| `m_outdone_order` | 1,169 | 1,169 | 1,169 | 100.0% | 14 | 13 | 0 |
| `m_raw_stock` | 2,430 | 2,430 | 2,430 | 100.0% | 22 | 21 | 0 |
| `m_rawmeat` | 15 | 15 | 15 | 100.0% | 17 | 16 | 0 |
| `m_seasoning` | 83 | 83 | 83 | 100.0% | 11 | 10 | 0 |
| `m_shippingmethod` | 1 | 1 | 1 | 100.0% | 6 | 5 | 0 |
| `nos_ordertag` | 30 | 30 | 30 | 100.0% | 7 | 6 | 0 |
| `osdriver_menu` | 0 | 0 | 0 | 100.0% | 5 | 0 | 0 |
| `print_label` | 0 | 0 | 0 | 100.0% | 15 | 0 | 0 |
| `quote_bento_additionalitem` | 2,273 | 2,273 | 2,273 | 100.0% | 9 | 7 | 0 |
| `quote_bento_eventpart` | 639 | 639 | 639 | 100.0% | 10 | 9 | 0 |
| `quote_file` | 722 | 722 | 722 | 100.0% | 8 | 7 | 0 |
| `quote_paymentmethod` | 2,159 | 2,159 | 2,159 | 100.0% | 7 | 6 | 0 |
| `quote_t&c` | 8,070 | 8,070 | 8,070 | 100.0% | 7 | 6 | 0 |
| `s_comment` | 121 | 121 | 121 | 100.0% | 10 | 8 | 0 |
| `s_customer_tag` | 1 | 1 | 1 | 100.0% | 8 | 7 | 0 |
| `s_ingredient_stocktake` | 8,745 | 8,745 | 8,745 | 100.0% | 9 | 8 | 0 |
| `s_ingredients_product` | 1,747 | 1,747 | 1,747 | 100.0% | 10 | 7 | 0 |
| `s_order` | 61,073 | 61,073 | 61,073 | 100.0% | 25 | 23 | 0 |
| `s_packages_choiceset` | 631 | 631 | 631 | 100.0% | 11 | 7 | 0 |
| `s_packages_product` | 3,764 | 3,764 | 3,764 | 100.0% | 11 | 9 | 0 |
| `s_packing_stocktake` | 3,201 | 3,201 | 3,201 | 100.0% | 9 | 8 | 0 |
| `s_payment` | 4,711 | 4,711 | 4,711 | 100.0% | 14 | 12 | 0 |
| `s_paymentreport` | 2,147 | 2,147 | 2,147 | 100.0% | 14 | 13 | 0 |
| `shop_dailysales` | 77,947 | 77,947 | 77,947 | 100.0% | 27 | 26 | 0 |
| `shop_ds_holiday` | 0 | 0 | 0 | 100.0% | 8 | 0 | 0 |
| `shop_ds_new_product` | 106 | 106 | 106 | 100.0% | 9 | 8 | 0 |
| `shop_ds_restro_depart` | 4 | 4 | 4 | 100.0% | 8 | 7 | 0 |
| `shop_ds_staff_list` | 0 | 0 | 0 | 100.0% | 12 | 0 | 0 |
| `shop_ds_time_slot` | 0 | 0 | 0 | 100.0% | 9 | 0 | 0 |
| `shop_dscost` | 26 | 26 | 26 | 100.0% | 10 | 8 | 0 |
| `shop_dscost_type` | 9 | 9 | 9 | 100.0% | 7 | 6 | 0 |
| `shop_dspaymentmethod` | 13 | 13 | 13 | 100.0% | 9 | 8 | 0 |
| `shop_dsrestro_period` | 5 | 5 | 5 | 100.0% | 8 | 7 | 0 |
| `shop_food_deli_platform` | 5 | 5 | 5 | 100.0% | 8 | 7 | 0 |
| `shop_ingredients` | 457 | 457 | 457 | 100.0% | 11 | 10 | 0 |
| `shop_monthly_cost` | 1,508 | 1,508 | 1,508 | 100.0% | 13 | 12 | 0 |
| `shop_roster` | 0 | 0 | 0 | 100.0% | 16 | 0 | 0 |
| `shop_stocktake` | 23,053 | 23,053 | 23,053 | 100.0% | 13 | 12 | 0 |
| `shop_supplier_purchase` | 24,627 | 24,627 | 24,627 | 100.0% | 10 | 9 | 0 |
| `shopds_purchasetype` | 3 | 3 | 3 | 100.0% | 8 | 7 | 0 |
| `shopdsrestro` | 2 | 2 | 2 | 100.0% | 7 | 6 | 0 |

### 不完整／不可读取类型

- 所有 production Swagger 类型均已完整导出。

## 3. 全量关系与孤儿检查

| 来源 | Bubble 字段 | 目标 | 基数 | 有值记录 | 引用 | 唯一引用 | 已解析 | 孤儿 | 置信度 |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| `a_label` | `Packing` | `ds_packing` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `a_label` | `Product` | `a_products` | 多对一 | 7245 | 7245 | 6904 | 6904 | 0 | 高 |
| `a_order` | `(Quote) Communication Channels` | `dscommuchannels(quote)` | 多对一 | 103 | 103 | 3 | 3 | 0 | 高 |
| `a_order` | `(Quote) delivery text` | `ds_quote_delivery` | 多对一 | 852 | 852 | 12 | 12 | 0 | 高 |
| `a_order` | `(Quote) Source of Sales` | `dssourceofsales(quote)` | 多对一 | 113 | 113 | 3 | 3 | 0 | 高 |
| `a_order` | `A_customer` | `a_customers` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `a_order` | `ORDER_Channel` | `ds_channel` | 多对一 | 5920 | 5920 | 8 | 8 | 0 | 高 |
| `a_order` | `Delivery_DS_Deli District` | `ds_deliverydistrict` | 多对一 | 4241 | 4241 | 194 | 194 | 0 | 高 |
| `a_order` | `Report_DS Festival` | `ds_festival` | 多对一 | 1650 | 1650 | 6 | 6 | 0 | 高 |
| `a_order` | `Delivery_DS_Shipping Method` | `ds_shippingmethod` | 多对一 | 5807 | 5807 | 6 | 6 | 0 | 高 |
| `a_order` | `Delivery_Motorcade` | `ds_super_motorcade` | 多对一 | 3068 | 3068 | 5 | 5 | 0 | 高 |
| `a_order` | `ORDER_tag` | `nos_ordertag` | 候选多对多 | 5011 | 6523 | 30 | 30 | 0 | 高 |
| `a_order` | `Sales Partner` | `ds_salespartner` | 多对一 | 7 | 7 | 5 | 5 | 0 | 高 |
| `a_order` | `Shopify_FirstReminder` | `dsreminderperson(first)` | 候选多对多 | 210 | 536 | 3 | 3 | 0 | 高 |
| `a_order` | `Shopify_SecondReminder` | `dsreminderperson(second)` | 候选多对多 | 714 | 1424 | 2 | 2 | 0 | 高 |
| `a_order` | `ORDER_Status` | `ds_status` | 候选多对多 | 1880 | 3279 | 12 | 12 | 0 | 高 |
| `a_packages` | `Channel` | `ds_channel` | 多对一 | 172 | 172 | 4 | 4 | 0 | 高 |
| `a_packages` | `Choice Set` | `s_packages_choiceset` | 候选多对多 | 0 | 0 | 0 | 0 | 0 | 高 |
| `a_packages` | `Ingredients` | `s_ingredients_product` | 候选多对多 | 0 | 0 | 0 | 0 | 0 | 高 |
| `a_products` | `bento_main dish` | `bento_maintype` | 多对一 | 106 | 106 | 6 | 6 | 0 | 高 |
| `a_products` | `bento_main ingre` | `bento_mainingredients` | 候选多对多 | 100 | 108 | 8 | 8 | 0 | 高 |
| `a_products` | `bento_no. of column` | `bento_numberofcolumn` | 多对一 | 110 | 110 | 4 | 4 | 0 | 高 |
| `a_products` | `bento_special request` | `bento_specialrequest` | 候选多对多 | 100 | 583 | 9 | 9 | 0 | 高 |
| `a_products` | `R_Channel` | `ds_channel` | 多对一 | 1289 | 1289 | 5 | 5 | 0 | 高 |
| `a_products` | `DS CookType` | `ds_cooktype` | 多对一 | 4 | 4 | 2 | 2 | 0 | 高 |
| `a_products` | `R_Ingredients` | `s_ingredients_product` | 候选多对多 | 0 | 0 | 0 | 0 | 0 | 高 |
| `a_products` | `R_Collections` | `ds_collection` | 候选多对多 | 1157 | 1280 | 56 | 56 | 0 | 高 |
| `a_products` | `R_Label` | `a_label` | 候选多对多 | 0 | 0 | 0 | 0 | 0 | 高 |
| `a_products` | `R_Tags` | `ds_tags` | 候选多对多 | 0 | 0 | 0 | 0 | 0 | 高 |
| `a_products` | `R_Type` | `ds_type` | 多对一 | 1289 | 1289 | 47 | 47 | 0 | 高 |
| `b_adscostweekly` | `Ads_type` | `ds_cost_type` | 多对一 | 1265 | 1265 | 2 | 2 | 0 | 高 |
| `b_adscostweekly` | `Channel` | `ds_channel` | 多对一 | 1265 | 1265 | 7 | 7 | 0 | 高 |
| `b_costmonthly` | `Ads_single Brand` | `ds_channel` | 多对一 | 823 | 823 | 8 | 8 | 0 | 高 |
| `b_costmonthly` | `cost_type` | `ds_cost_type` | 多对一 | 1408 | 1408 | 12 | 12 | 0 | 高 |
| `b_costmonthly` | `Channels` | `ds_channel` | 候选多对多 | 1400 | 4104 | 8 | 8 | 0 | 高 |
| `b_costmonthly` | `Festival` | `ds_festival` | 多对一 | 175 | 175 | 6 | 6 | 0 | 高 |
| `b_deliveryschedule` | `A_order` | `a_order` | 候选一对一 | 3048 | 3048 | 3048 | 3048 | 0 | 高 |
| `b_deliveryschedule` | `DS_delivery district` | `ds_deliverydistrict` | 多对一 | 3045 | 3045 | 185 | 185 | 0 | 高 |
| `b_deliveryschedule` | `DS_motorcade` | `ds_super_motorcade` | 多对一 | 3037 | 3037 | 5 | 5 | 0 | 高 |
| `b_deliveryschedule` | `DS_Super_Motorcade_supDriver` | `ds_super_motorcade_subdriver` | 多对一 | 1307 | 1307 | 30 | 30 | 0 | 高 |
| `b_deliveryschedule_surcharge` | `B_delivery_schedule` | `b_deliveryschedule` | 多对一 | 1559 | 1559 | 1284 | 1284 | 0 | 高 |
| `b_deliveryschedule_surcharge` | `DS_delivery surchage` | `ds_deliverysurcharge` | 多对一 | 1560 | 1560 | 4 | 4 | 0 | 高 |
| `b_product_ingredients` | `A_order` | `a_order` | 多对一 | 79873 | 79873 | 4260 | 4260 | 0 | 高 |
| `b_product_ingredients` | `Ingredient` | `ds_ingredients` | 多对一 | 79908 | 79908 | 194 | 194 | 0 | 高 |
| `b_product_ingredients` | `S_order` | `s_order` | 多对一 | 77114 | 77114 | 28946 | 28945 | 1 | 中 |
| `b_product_ingredients` | `Order_product` | `a_products` | 多对一 | 79903 | 79903 | 496 | 496 | 0 | 高 |
| `b_supplierpurchase` | `DS_purchase_type` | `ds_purchasetype` | 多对一 | 9988 | 9988 | 3 | 3 | 0 | 高 |
| `b_supplierpurchase` | `Supplier` | `ds__ingredient_supplier` | 多对一 | 9988 | 9988 | 43 | 43 | 0 | 高 |
| `cal_control` | `order` | `a_order` | 多对一 | 1829 | 1829 | 1757 | 1757 | 0 | 高 |
| `cal_control` | `Package` | `a_packages` | 多对一 | 1842 | 1842 | 130 | 130 | 0 | 高 |
| `cal_control` | `Package_Set` | `s_packages_choiceset` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `cal_package_choice` | `Control` | `cal_control` | 多对一 | 1502 | 1502 | 53 | 53 | 0 | 高 |
| `cal_package_choice` | `Order` | `a_order` | 多对一 | 1502 | 1502 | 53 | 53 | 0 | 高 |
| `cal_package_choice` | `Package` | `a_packages` | 多对一 | 1502 | 1502 | 18 | 18 | 0 | 高 |
| `cal_package_choice` | `Package_Product` | `s_packages_product` | 多对一 | 1502 | 1502 | 513 | 513 | 0 | 高 |
| `cal_package_choice` | `S_Package_Choice` | `s_packages_choiceset` | 多对一 | 959 | 959 | 99 | 99 | 0 | 高 |
| `cal_package_choice` | `Type` | `ds_type` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `ds_collection` | `Channel` | `ds_channel` | 多对一 | 56 | 56 | 5 | 5 | 0 | 高 |
| `ds_customer_tag` | `DS_customer_tag_type` | `ds_customer_tag_type` | 多对一 | 1 | 1 | 1 | 1 | 0 | 高 |
| `ds_deliverydistrict` | `Driver team` | `ds_super_motorcade` | 多对一 | 299 | 299 | 3 | 3 | 0 | 高 |
| `ds_ingredients` | `Supplier` | `ds__ingredient_supplier` | 多对一 | 311 | 311 | 46 | 46 | 0 | 高 |
| `ds_super_motorcade_subdriver` | `DS_Super_Motorcade` | `ds_super_motorcade` | 多对一 | 31 | 31 | 1 | 1 | 0 | 高 |
| `ds_type` | `channel` | `ds_channel` | 多对一 | 47 | 47 | 5 | 5 | 0 | 高 |
| `dsaoproduct` | `Channels` | `ds_channel` | 多对一 | 15 | 15 | 1 | 1 | 0 | 高 |
| `dsaoproduct` | `Product` | `a_products` | 候选一对一 | 15 | 15 | 15 | 15 | 0 | 高 |
| `m_donemeat` | `raw_meat` | `m_rawmeat` | 多对一 | 16 | 16 | 15 | 15 | 0 | 高 |
| `m_donemeat_stock` | `DoneMeat` | `m_donemeat` | 多对一 | 11219 | 11219 | 29 | 29 | 0 | 高 |
| `m_donemeat_stock` | `from_rawStock` | `m_raw_stock` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `m_donemeat_stock` | `from_rawStock_list` | `m_raw_stock` | 候选多对多 | 1213 | 1263 | 1221 | 1204 | 17 | 中 |
| `m_donemeat_stock` | `M_outDone_doneMeat` | `m_outdone_donemeat` | 候选一对一 | 9794 | 9794 | 9794 | 9794 | 0 | 高 |
| `m_donemeat_stock` | `Shop_M_cust` | `m_customer` | 多对一 | 9834 | 9834 | 4 | 4 | 0 | 高 |
| `m_meatseasoning_cost` | `M_doneMeat` | `m_donemeat` | 多对一 | 645 | 645 | 20 | 20 | 0 | 高 |
| `m_meatseasoning_cost` | `M_rawMeat` | `m_rawmeat` | 多对一 | 550 | 550 | 15 | 15 | 0 | 高 |
| `m_meatseasoning_cost` | `seasoning` | `m_seasoning` | 多对一 | 645 | 645 | 77 | 77 | 0 | 高 |
| `m_monthly_meatprice` | `Raw_meat` | `m_rawmeat` | 多对一 | 646 | 646 | 15 | 15 | 0 | 高 |
| `m_outdone_donemeat` | `M_doneMeat` | `m_donemeat` | 多对一 | 9791 | 9791 | 28 | 28 | 0 | 高 |
| `m_outdone_donemeat` | `M_outDone_order` | `m_outdone_order` | 多对一 | 9823 | 9823 | 1158 | 1158 | 0 | 高 |
| `m_outdone_donemeat` | `M_rawMeat` | `m_rawmeat` | 多对一 | 28 | 28 | 2 | 2 | 0 | 高 |
| `m_outdone_order` | `M_cust` | `m_customer` | 多对一 | 1169 | 1169 | 4 | 4 | 0 | 高 |
| `m_outdone_order` | `shippingMethod` | `m_shippingmethod` | 多对一 | 768 | 768 | 1 | 1 | 0 | 高 |
| `m_raw_stock` | `in_supplier` | `ds__ingredient_supplier` | 多对一 | 1199 | 1199 | 5 | 5 | 0 | 高 |
| `m_raw_stock` | `M_outDone_doneMeat` | `m_outdone_donemeat` | 候选一对一 | 27 | 27 | 27 | 27 | 0 | 高 |
| `m_raw_stock` | `Raw_meat` | `m_rawmeat` | 多对一 | 2429 | 2429 | 15 | 15 | 0 | 高 |
| `m_raw_stock` | `rel_in_stock` | `m_raw_stock` | 候选多对多 | 1229 | 1229 | 1197 | 1197 | 0 | 高 |
| `m_rawmeat` | `Supplier` | `ds__ingredient_supplier` | 候选多对多 | 15 | 24 | 5 | 5 | 0 | 高 |
| `print_label` | `Label` | `a_label` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `print_label` | `Order` | `a_order` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `print_label` | `Product` | `a_products` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `print_label` | `S_order` | `s_order` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `quote_bento_additionalitem` | `A_order` | `a_order` | 多对一 | 2273 | 2273 | 613 | 613 | 0 | 高 |
| `quote_bento_additionalitem` | `DS_addiction item ID` | `ds_bento_additionalitem` | 多对一 | 2083 | 2083 | 5 | 5 | 0 | 高 |
| `quote_bento_eventpart` | `A_order` | `a_order` | 多对一 | 639 | 639 | 498 | 498 | 0 | 高 |
| `quote_bento_eventpart` | `ds_bento_event item` | `ds_bento_eventpart` | 多对一 | 87 | 87 | 1 | 1 | 0 | 高 |
| `quote_file` | `A_order` | `a_order` | 多对一 | 722 | 722 | 625 | 625 | 0 | 高 |
| `quote_paymentmethod` | `A_order` | `a_order` | 多对一 | 2149 | 2149 | 763 | 763 | 0 | 高 |
| `quote_t&c` | `A_order` | `a_order` | 多对一 | 8056 | 8056 | 1580 | 1580 | 0 | 高 |
| `s_comment` | `A_customer` | `a_customers` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `s_comment` | `A_order` | `a_order` | 多对一 | 119 | 119 | 101 | 101 | 0 | 高 |
| `s_customer_tag` | `tag` | `ds_customer_tag` | 多对一 | 1 | 1 | 1 | 1 | 0 | 高 |
| `s_customer_tag` | `tag type` | `ds_customer_tag_type` | 多对一 | 1 | 1 | 1 | 1 | 0 | 高 |
| `s_ingredient_stocktake` | `active ingredient` | `ds_ingredients` | 多对一 | 8745 | 8745 | 185 | 185 | 0 | 高 |
| `s_ingredients_product` | `Ingredients` | `ds_ingredients` | 多对一 | 1747 | 1747 | 193 | 193 | 0 | 高 |
| `s_ingredients_product` | `Package` | `a_packages` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `s_ingredients_product` | `Product` | `a_products` | 多对一 | 1746 | 1746 | 605 | 605 | 0 | 高 |
| `s_order` | `Order` | `a_order` | 多对一 | 61046 | 61046 | 5802 | 5802 | 0 | 高 |
| `s_order` | `Package` | `a_packages` | 多对一 | 21048 | 21048 | 125 | 125 | 0 | 高 |
| `s_order` | `Product` | `a_products` | 多对一 | 59280 | 59280 | 6686 | 6686 | 0 | 高 |
| `s_packages_choiceset` | `Package` | `a_packages` | 多对一 | 631 | 631 | 170 | 170 | 0 | 高 |
| `s_packages_choiceset` | `Product` | `s_packages_product` | 候选多对多 | 0 | 0 | 0 | 0 | 0 | 高 |
| `s_packages_choiceset` | `Type` | `ds_type` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `s_packages_product` | `Package_ChoiceSet` | `s_packages_choiceset` | 多对一 | 2387 | 2387 | 629 | 629 | 0 | 高 |
| `s_packages_product` | `Package` | `a_packages` | 多对一 | 3755 | 3755 | 168 | 168 | 0 | 高 |
| `s_packages_product` | `Product` | `a_products` | 多对一 | 3764 | 3764 | 545 | 545 | 0 | 高 |
| `s_packing_stocktake` | `packing_DS_ing` | `ds_ingredients` | 多对一 | 3201 | 3201 | 47 | 47 | 0 | 高 |
| `s_payment` | `Channels` | `ds_channel` | 多对一 | 4710 | 4710 | 7 | 7 | 0 | 高 |
| `s_payment` | `Order` | `a_order` | 多对一 | 4710 | 4710 | 4302 | 4302 | 0 | 高 |
| `s_payment` | `Payment Method` | `ds_paymentmethod` | 多对一 | 4711 | 4711 | 17 | 17 | 0 | 高 |
| `s_paymentreport` | `Channels` | `ds_channel` | 多对一 | 2147 | 2147 | 7 | 7 | 0 | 高 |
| `s_paymentreport` | `Payment Method` | `ds_paymentmethod` | 多对一 | 2147 | 2147 | 17 | 17 | 0 | 高 |
| `s_paymentreport` | `S_payment` | `s_payment` | 候选多对多 | 2116 | 4642 | 4642 | 4642 | 0 | 高 |
| `shop_dailysales` | `restro` | `shopdsrestro` | 多对一 | 77947 | 77947 | 2 | 2 | 0 | 高 |
| `shop_dailysales` | `SHOP_DS_new_product` | `shop_ds_new_product` | 多对一 | 15996 | 15996 | 103 | 103 | 0 | 高 |
| `shop_dailysales` | `SHOP_DS pyament method` | `shop_dspaymentmethod` | 多对一 | 23004 | 23004 | 13 | 13 | 0 | 高 |
| `shop_dailysales` | `SHOP_DS_restro_depart` | `shop_ds_restro_depart` | 多对一 | 7088 | 7088 | 4 | 4 | 0 | 高 |
| `shop_dailysales` | `SHOP_DS_time_period` | `shop_dsrestro_period` | 多对一 | 8860 | 8860 | 5 | 5 | 0 | 高 |
| `shop_dailysales` | `SHOP_food deli_platform` | `shop_food_deli_platform` | 多对一 | 8860 | 8860 | 5 | 5 | 0 | 高 |
| `shop_ds_staff_list` | `restro` | `shopdsrestro` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `shop_ds_time_slot` | `restro period` | `shop_dsrestro_period` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `shop_dscost` | `Cost Type` | `shop_dscost_type` | 多对一 | 26 | 26 | 9 | 9 | 0 | 高 |
| `shop_ingredients` | `Supplier` | `ds__ingredient_supplier` | 多对一 | 457 | 457 | 19 | 19 | 0 | 高 |
| `shop_monthly_cost` | `cost` | `shop_dscost` | 多对一 | 1508 | 1508 | 26 | 26 | 0 | 高 |
| `shop_monthly_cost` | `Cost_type` | `shop_dscost_type` | 多对一 | 1508 | 1508 | 9 | 9 | 0 | 高 |
| `shop_monthly_cost` | `Restro` | `shopdsrestro` | 多对一 | 1508 | 1508 | 2 | 2 | 0 | 高 |
| `shop_roster` | `Holiday` | `shop_ds_holiday` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `shop_roster` | `restro` | `shopdsrestro` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `shop_roster` | `SHOP_DS_time_slot` | `shop_ds_time_slot` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `shop_roster` | `SHOP restro period` | `shop_dsrestro_period` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `shop_roster` | `Staff` | `shop_ds_staff_list` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `shop_stocktake` | `shop_ingredients` | `shop_ingredients` | 多对一 | 23053 | 23053 | 457 | 457 | 0 | 高 |
| `shop_stocktake` | `Shop_restro` | `shopdsrestro` | 多对一 | 23053 | 23053 | 2 | 2 | 0 | 高 |
| `shop_stocktake` | `Supplier` | `ds__ingredient_supplier` | 多对一 | 23046 | 23046 | 19 | 19 | 0 | 高 |
| `shop_supplier_purchase` | `Restro` | `shopdsrestro` | 多对一 | 24624 | 24624 | 2 | 2 | 0 | 高 |
| `shop_supplier_purchase` | `supplier` | `ds__ingredient_supplier` | 多对一 | 24582 | 24582 | 16 | 16 | 0 | 高 |
| `shop_supplier_purchase` | `type` | `shopds_purchasetype` | 多对一 | 24627 | 24627 | 3 | 3 | 0 | 高 |

### 孤儿引用

| 来源字段 | 目标 | 孤儿数 | Bubble ID 样本 |
|---|---|---:|---|
| `b_product_ingredients.S_order` | `s_order` | 1 | `1768790210528x973222345052520400` |
| `m_donemeat_stock.from_rawStock_list` | `m_raw_stock` | 17 | `1760495041794x843961055944522500, 1761207068993x299835922539724040, 1762140673225x335824175698444600` |

## 4. 金额与交易摘要

- `a_order` ORDER_Grand total：HK$26,383,281.10
- `a_order` ORDER_oustanding：HK$7,049,113.43
- `a_order` ORDER_折扣(-)：HK$1,117,334.90
- `a_order` ORDER_運費(+)：HK$637,426.00
- `s_payment` Amount：HK$13,972,308.62
- `s_order` Void：349 / 61,073

以上仅为来源字段直接加总，不等于业务规则对账结果。

## 5. Swagger 与实际类型差异

- 未发现 Swagger primitive type 与实际值不符。

## 6. 导入就绪判断

- 来源数量完整：是
- 重复 legacy ID 为零：是
- 可验证目标的孤儿为零：否
- Primitive type 一致：是
- UUID crosswalk：尚未执行
- 金额业务对账：尚未签核
- 文件 checksum 对账：尚未执行
- User/Auth 迁移：尚未执行，`user.pw` 永不迁移

## 7. 建议下一步

1. 处理不可读取或目标不可用的关系类型。
2. 审批实体分类及 `docs/MIGRATION_SCHEMA_DRAFT.md`。
3. 确认订单、付款、Void、Outstanding 与 Cashdollar 公式。
4. 在 Supabase develop 建立 schema，并先导入 lookup/master 小批次。
5. 执行 UUID crosswalk、全量孤儿、数量、金额及文件对账。
