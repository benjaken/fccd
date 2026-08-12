# Production Bubble 核心数据分析报告

> 本报告由 production Data API 导出的本地数据生成。
> 仅包含聚合统计和 Bubble ID 对账样本，不包含客户、订单或付款原始内容。

## 1. 执行摘要

- 分析类型：12
- 导出记录：87,322
- 当前来源记录：87,322
- 尚未导出记录：0
- Manifest 错误：0
- 重复 Bubble `_id`：0
- 显式关系字段：42
- 实际类型不符字段：0

## 2. 数据类型与记录数

| Bubble 类型 | 当前来源 | Manifest | 本地记录 | 完成率 | Schema 字段 | 有值字段 | 重复 ID |
|---|---:|---:|---:|---:|---:|---:|---:|
| `a_customers` | 0 | 0 | 0 | 100.0% | 11 | 0 | 0 |
| `a_order` | 5,922 | 5,922 | 5,922 | 100.0% | 65 | 61 | 0 |
| `a_packages` | 175 | 175 | 175 | 100.0% | 14 | 11 | 0 |
| `a_products` | 8,302 | 8,302 | 8,302 | 100.0% | 27 | 21 | 0 |
| `b_deliveryschedule` | 3,048 | 3,048 | 3,048 | 100.0% | 19 | 18 | 0 |
| `ds_channel` | 8 | 8 | 8 | 100.0% | 13 | 12 | 0 |
| `ds_deliverydistrict` | 314 | 314 | 314 | 100.0% | 8 | 7 | 0 |
| `ds_paymentmethod` | 17 | 17 | 17 | 100.0% | 8 | 7 | 0 |
| `ds_shippingmethod` | 6 | 6 | 6 | 100.0% | 13 | 12 | 0 |
| `s_order` | 61,056 | 61,056 | 61,056 | 100.0% | 25 | 23 | 0 |
| `s_packages_product` | 3,764 | 3,764 | 3,764 | 100.0% | 11 | 9 | 0 |
| `s_payment` | 4,710 | 4,710 | 4,710 | 100.0% | 14 | 12 | 0 |

### 不完整导出

- 所有选择类型均已完整导出。

## 3. 关系完整性

| 来源 | Bubble 字段 | 目标 | 推断基数 | 有值记录 | 引用值 | 唯一引用 | 已解析 | 孤儿 | 置信度 |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| `a_order` | `(Quote) Communication Channels` | `dscommuchannels(quote)` | 多对一 | 103 | 103 | 3 | 目标未导出 | — | 中 |
| `a_order` | `(Quote) delivery text` | `ds_quote_delivery` | 多对一 | 852 | 852 | 12 | 目标未导出 | — | 中 |
| `a_order` | `(Quote) Source of Sales` | `dssourceofsales(quote)` | 多对一 | 113 | 113 | 3 | 目标未导出 | — | 中 |
| `a_order` | `A_customer` | `a_customers` | 多对一 | 0 | 0 | 0 | 0 | 0 | 高 |
| `a_order` | `ORDER_Channel` | `ds_channel` | 多对一 | 5920 | 5920 | 8 | 8 | 0 | 高 |
| `a_order` | `Delivery_DS_Deli District` | `ds_deliverydistrict` | 多对一 | 4239 | 4239 | 194 | 194 | 0 | 高 |
| `a_order` | `Report_DS Festival` | `ds_festival` | 多对一 | 1650 | 1650 | 6 | 目标未导出 | — | 中 |
| `a_order` | `Delivery_DS_Shipping Method` | `ds_shippingmethod` | 多对一 | 5805 | 5805 | 6 | 6 | 0 | 高 |
| `a_order` | `Delivery_Motorcade` | `ds_super_motorcade` | 多对一 | 3068 | 3068 | 5 | 目标未导出 | — | 中 |
| `a_order` | `ORDER_tag` | `nos_ordertag` | 候选多对多 | 5009 | 6521 | 30 | 目标未导出 | — | 中 |
| `a_order` | `Sales Partner` | `ds_salespartner` | 多对一 | 7 | 7 | 5 | 目标未导出 | — | 中 |
| `a_order` | `Shopify_FirstReminder` | `dsreminderperson(first)` | 候选多对多 | 210 | 536 | 3 | 目标未导出 | — | 中 |
| `a_order` | `Shopify_SecondReminder` | `dsreminderperson(second)` | 候选多对多 | 714 | 1424 | 2 | 目标未导出 | — | 中 |
| `a_order` | `ORDER_Status` | `ds_status` | 候选多对多 | 1878 | 3276 | 12 | 目标未导出 | — | 中 |
| `a_packages` | `Channel` | `ds_channel` | 多对一 | 172 | 172 | 4 | 4 | 0 | 高 |
| `a_packages` | `Choice Set` | `s_packages_choiceset` | 候选多对多 | 0 | 0 | 0 | 目标未导出 | — | Schema-only |
| `a_packages` | `Ingredients` | `s_ingredients_product` | 候选多对多 | 0 | 0 | 0 | 目标未导出 | — | Schema-only |
| `a_products` | `bento_main dish` | `bento_maintype` | 多对一 | 106 | 106 | 6 | 目标未导出 | — | 中 |
| `a_products` | `bento_main ingre` | `bento_mainingredients` | 候选多对多 | 100 | 108 | 8 | 目标未导出 | — | 中 |
| `a_products` | `bento_no. of column` | `bento_numberofcolumn` | 多对一 | 110 | 110 | 4 | 目标未导出 | — | 中 |
| `a_products` | `bento_special request` | `bento_specialrequest` | 候选多对多 | 100 | 583 | 9 | 目标未导出 | — | 中 |
| `a_products` | `R_Channel` | `ds_channel` | 多对一 | 1289 | 1289 | 5 | 5 | 0 | 高 |
| `a_products` | `DS CookType` | `ds_cooktype` | 多对一 | 4 | 4 | 2 | 目标未导出 | — | 中 |
| `a_products` | `R_Ingredients` | `s_ingredients_product` | 候选多对多 | 0 | 0 | 0 | 目标未导出 | — | Schema-only |
| `a_products` | `R_Collections` | `ds_collection` | 候选多对多 | 1157 | 1280 | 56 | 目标未导出 | — | 中 |
| `a_products` | `R_Label` | `a_label` | 候选多对多 | 0 | 0 | 0 | 目标未导出 | — | Schema-only |
| `a_products` | `R_Tags` | `ds_tags` | 候选多对多 | 0 | 0 | 0 | 目标未导出 | — | Schema-only |
| `a_products` | `R_Type` | `ds_type` | 多对一 | 1289 | 1289 | 47 | 目标未导出 | — | 中 |
| `b_deliveryschedule` | `A_order` | `a_order` | 候选一对一 | 3048 | 3048 | 3048 | 3048 | 0 | 高 |
| `b_deliveryschedule` | `DS_delivery district` | `ds_deliverydistrict` | 多对一 | 3045 | 3045 | 185 | 185 | 0 | 高 |
| `b_deliveryschedule` | `DS_motorcade` | `ds_super_motorcade` | 多对一 | 3037 | 3037 | 5 | 目标未导出 | — | 中 |
| `b_deliveryschedule` | `DS_Super_Motorcade_supDriver` | `ds_super_motorcade_subdriver` | 多对一 | 1307 | 1307 | 30 | 目标未导出 | — | 中 |
| `ds_deliverydistrict` | `Driver team` | `ds_super_motorcade` | 多对一 | 299 | 299 | 3 | 目标未导出 | — | 中 |
| `s_order` | `Order` | `a_order` | 多对一 | 61029 | 61029 | 5801 | 5801 | 0 | 高 |
| `s_order` | `Package` | `a_packages` | 多对一 | 21048 | 21048 | 125 | 125 | 0 | 高 |
| `s_order` | `Product` | `a_products` | 多对一 | 59263 | 59263 | 6686 | 6686 | 0 | 高 |
| `s_packages_product` | `Package_ChoiceSet` | `s_packages_choiceset` | 多对一 | 2387 | 2387 | 629 | 目标未导出 | — | 中 |
| `s_packages_product` | `Package` | `a_packages` | 多对一 | 3755 | 3755 | 168 | 168 | 0 | 高 |
| `s_packages_product` | `Product` | `a_products` | 多对一 | 3764 | 3764 | 545 | 545 | 0 | 高 |
| `s_payment` | `Channels` | `ds_channel` | 多对一 | 4709 | 4709 | 7 | 7 | 0 | 高 |
| `s_payment` | `Order` | `a_order` | 多对一 | 4709 | 4709 | 4301 | 4301 | 0 | 高 |
| `s_payment` | `Payment Method` | `ds_paymentmethod` | 多对一 | 4710 | 4710 | 17 | 17 | 0 | 高 |

### 孤儿引用样本

- 已导出目标范围内未发现孤儿引用。

## 4. 金额与交易摘要

- `a_order` ORDER_Grand total 合计：HK$26,380,811.10
- `a_order` ORDER_oustanding 合计：HK$7,049,113.43
- `a_order` ORDER_折扣(-) 合计：HK$1,117,334.90
- `a_order` ORDER_運費(+) 合计：HK$637,376.00
- `s_payment` Amount 合计：HK$13,969,838.62
- `s_order` Void 明细：349 / 61,056

以上金额只是来源字段直接加总，不代表已完成业务对账；退款、Void、
Payout、Cashdollar 与历史公式仍需业务规则确认。
本次选择的 12 个类型已完整导出；以上为完整来源字段加总。

## 5. Swagger 与实际类型差异

- 已导出范围内未发现 Swagger primitive type 与实际值不符。

## 6. 导入前结论

- 当前报告只验证已导出的 12 个核心／基础类型。
- 12 个选择类型的来源数量与本地导出数量一致。
- 目标未导出的关系只能标记为 Schema 推断，不能判断孤儿。
- Bubble ID 必须先保存为 `legacy_id text`，再解析为 Supabase UUID FK。
- 所有孤儿、重复 ID、金额差异及字段类型差异处理完成后，才能写入 develop。
- `user.pw` 不在本次导出范围，后续也不得迁移。

## 7. 下一步建议

1. 补导关系报告中标记为「目标未导出」的 lookup 类型。
2. 对完整目标 ID 集重新执行孤儿检查。
3. 确认订单、付款、Void、Outstanding 与 Cashdollar 公式。
4. 审批 `docs/MIGRATION_SCHEMA_DRAFT.md`。
5. 只在 Supabase develop 建立正式 schema 并进行小批量试导入。
