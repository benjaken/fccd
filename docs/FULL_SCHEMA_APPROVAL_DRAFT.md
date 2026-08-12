# Supabase 全量 Schema 审批草案

> 状态：等待业务及技术审批，不执行数据库变更。
> 数据快照：`2026-08-12T02:39:34.000Z`
> 数据报告：`docs/FULL_MIGRATION_DATA_REPORT.md`

## 1. 快照结论

| 项目 | 结果 |
|---|---:|
| Production Swagger 类型 | 98 |
| 快照来源记录 | 377,116 |
| 本地导出记录 | 377,116 |
| 尚未导出 | 0 |
| API／Manifest 错误 | 0 |
| 重复 Bubble `_id` | 0 |
| 显式关系字段 | 144 |
| Primitive type 不符 | 0 |
| 已确认孤儿引用 | 18 |

来源完整性已经通过，但孤儿、UUID crosswalk、金额、文件、Auth 和 RLS
尚未完成，因此本草案不能直接作为 production migration 执行。

## 2. 必须审批的全局规则

### 2.1 ID

```sql
id uuid primary key default gen_random_uuid(),
legacy_id text not null unique
```

- Bubble `_id` 不是 UUID，不直接 cast。
- 所有目标实体生成新的 UUID。
- 所有来源记录永久保留 `legacy_id`。
- 单值引用先进入 `xxx_legacy_id text`，解析后写入 `xxx_id uuid`。
- 数组引用进入 junction table，两端使用 UUID FK。

### 2.2 金额与时间

- 金额：`numeric(14,2)`；数量及重量：`numeric(14,3)` 或业务批准精度。
- 所有日期时间：`timestamptz`。
- 默认业务时区：`Asia/Hong_Kong`。
- 订单保存客户、价格、地址、条款及商品名称快照。

### 2.3 删除与历史

- 已被交易引用的 master data 只能 archive，不 cascade delete。
- 付款、库存、成本调整采用 append-only／reversal，不覆盖历史。
- Bubble 原始文件及历史附件另做 checksum 对账。

### 2.4 安全

- 所有 exposed tables 创建后立即启用 RLS。
- 在 legal entity、brand、site、department、customer、driver 范围确认前，
  不建立宽松 policy。
- `user.pw` 永不迁移。

## 3. 九个业务领域决策

| 领域 | Production 类型 | 快照记录 | 建议策略 |
|---|---:|---:|---|
| 客户、CRM、渠道与提醒 | 11 | 31 | Master + lookup + junction |
| 报价、订单与备注 | 10 | 78,132 | Operational header/detail/snapshot |
| 商品、套餐、菜单与标签 | 21 | 24,696 | Master + versioned junction |
| 食材、包装与生产计算 | 7 | 83,821 | Master + BOM snapshot + calculation detail |
| 配送与车队 | 8 | 4,969 | Operational delivery + fleet lookup |
| 付款、成本与采购 | 9 | 19,617 | Immutable payment/cost/purchase facts |
| 肉类加工与库存 | 11 | 38,049 | Batch + immutable stock movements |
| 店铺营运、销售、库存与排班 | 18 | 127,765 | Restaurant facts + lookup + stocktake |
| 日历、状态与系统 | 3 | 36 | Lookup/config |
| **合计** | **98** | **377,116** | |

## 4. 建议目标模块

### 4.1 Identity 与组织

| 来源 | 目标 |
|---|---|
| Bubble `user`（production 未开放） | `auth.users` + `profiles` |
| `shopdsrestro` | `restaurants` |
| `shop_ds_restro_depart` | `restaurant_departments` |
| `ds_channel` | `channels`／后续映射 brand/store |
| `shop_ds_staff_list` | `restaurant_staff`（当前空表） |

审批事项：

- `User.Email` 建立 Supabase Auth 用户。
- `profiles.id = auth.users.id`。
- `Role` 转为 role grant，不复制 Bubble 密码。
- `shop restro` 解析为 `restaurant_id uuid`。

### 4.2 客户与 CRM

| 来源 | 目标策略 |
|---|---|
| `a_customers` | `customers`；当前 0 条但保留正式结构 |
| `m_customer` | `meat_customers`；未确认前不与 customers 合并 |
| `ds_customer_tag_type` | `customer_tag_types` |
| `ds_customer_tag` | `customer_tags` |
| `s_customer_tag` | `customer_tag_assignments` |
| `ds_salespartner` | `sales_partners` |
| reminder person types | `reminder_recipients`／配置 |

### 4.3 报价与订单

| 来源 | 目标策略 |
|---|---|
| `a_order` | `orders`，使用 `document_type = quote/order` 待审批 |
| `s_order` | `order_lines` |
| `s_comment` | `order_timeline_entries` |
| `nos_ordertag` + `a_order.ORDER_tag[]` | `order_tags` + junction |
| `quote_file` | `order_files` + Supabase Storage |
| `quote_t&c` | `order_term_snapshots` |
| `quote_paymentmethod` | `order_payment_term_snapshots` |
| `ds_quote_*` | 报价模板 lookup |

`a_order` 当前混合 quote、order、Shopify、factory、delivery 状态。审批时选择：

1. 单表 `orders` + `document_type` + 独立状态机；或
2. `quotes` 与 `orders` 分表，并保存 conversion link。

### 4.4 商品、套餐与 BOM

| 来源 | 目标策略 |
|---|---|
| `a_products` | `products` |
| `a_packages` | `packages` |
| `s_packages_product` | `package_products` junction |
| `s_packages_choiceset` | `package_choice_sets` |
| `cal_package_choice` | order/package choice snapshot |
| `ds_ingredients` | `ingredients` |
| `ds_packing` | `packing_materials`（当前 0 条） |
| `s_ingredients_product` | `product_ingredients` |
| `b_product_ingredients` | `order_bom_requirements`／生产需求快照 |
| Bento／collection／tag／type | lookup + junction |

BOM 必须有版本或订单快照，历史订单不可随当前商品配方改变。

### 4.5 付款、成本与采购

| 来源 | 目标策略 |
|---|---|
| `s_payment` | `payments`，不可变交易记录 |
| `s_paymentreport` | `payment_settlements` |
| `b_costmonthly` | `monthly_cost_entries` |
| `b_adscostweekly` | `advertising_cost_entries` |
| `b_supplierpurchase` | `supplier_purchases` |
| `ds__ingredient_supplier` | `suppliers` |
| payment/cost/purchase types | lookup |

退款、Void、Payout 与 overpayment 使用 reversal／adjustment，不更新原付款金额。

### 4.6 配送

| 来源 | 目标策略 |
|---|---|
| `b_deliveryschedule` | `deliveries` |
| `b_deliveryschedule_surcharge` | `delivery_surcharges` |
| `ds_deliverydistrict` | `delivery_districts` |
| `ds_deliverysurcharge` | `delivery_surcharge_types` |
| `ds_shippingmethod` | `shipping_methods` |
| `ds_super_motorcade` | `fleets`／drivers 待角色确认 |
| `ds_super_motorcade_subdriver` | `drivers`／fleet members |

配送照片进入 Storage，并按订单／司机范围设置 RLS。

### 4.7 肉类加工与库存

| 来源 | 目标策略 |
|---|---|
| `m_rawmeat` | `raw_meat_items` |
| `m_donemeat` | `prepared_meat_items` |
| `m_outdone_order` | `meat_orders` |
| `m_outdone_donemeat` | `meat_order_lines` |
| `m_raw_stock` | `raw_meat_stock_movements` |
| `m_donemeat_stock` | `prepared_meat_stock_movements` |
| `m_seasoning` | `seasonings` |
| seasoning／monthly price | versioned cost tables |
| stocktake types | immutable stocktake events |

库存不迁移为单一可覆盖余额；使用 movement ledger 再计算余额。

### 4.8 店铺营运

| 来源 | 目标策略 |
|---|---|
| `shop_dailysales` | `restaurant_daily_sales` + payment split |
| `shop_monthly_cost` | `restaurant_monthly_costs` |
| `shop_stocktake` | `restaurant_stocktakes` |
| `shop_supplier_purchase` | `restaurant_supplier_purchases` |
| `shop_ingredients` | `restaurant_ingredients` |
| `shop_roster` | `restaurant_rosters`（当前 0 条，待确认是否启用） |
| Shop DS 类型 | lookup/config |

中央厨房向分店出货不可与供应商采购混为同一 document type。

## 5. 空表与 production 未开放类型

### 5.1 当前空表

- `a_customers`
- `ds_packing`
- `ds_tags`
- `osdriver_menu`
- `print_label`
- `shop_ds_holiday`
- `shop_ds_staff_list`
- `shop_ds_time_slot`
- `shop_roster`

空表不代表可删除。必须确认是未来功能、停用功能，还是 production API
未暴露数据。

### 5.2 Version-test 有但 production Swagger 未开放

- `MM_Products`
- `Announcement`
- `DS_driver assign remind`
- `Font`
- `User`

本轮 production 快照不包含以上类型。需要业务决定：

- 另行受控获取；
- 由 Supabase 新系统重建；或
- 签核排除。

## 6. 已确认孤儿引用

| 来源字段 | 目标 | 孤儿数 | 建议处理 |
|---|---|---:|---|
| `b_product_ingredients.S_order` | `s_order` | 1 | 保留 legacy ID、UUID FK 暂空、查旧订单明细 |
| `m_donemeat_stock.from_rawStock_list` | `m_raw_stock` | 17 | 建立异常清单，确认删除／历史批次 |

正式导入规则：

```text
legacy reference 保留
→ UUID FK 解析失败
→ 写入 reconciliation issue
→ 不以伪造 UUID 代替
→ 经业务签核后修复、归档或接受例外
```

## 7. 分阶段建表与试导入

### Phase A：Lookup / Master

```text
channels
payment_methods
delivery_districts
shipping_methods
statuses
tags
suppliers
restaurants
departments
```

### Phase B：Commercial Master

```text
customers
products
packages
ingredients
package_products
product_ingredients
```

### Phase C：Catering Transaction

```text
orders
order_lines
payments
deliveries
order comments/files/terms
```

### Phase D：Production / Meat / Inventory

```text
order_bom_requirements
meat orders and batches
inventory movement ledgers
stocktake events
cost versions
```

### Phase E：Restaurant

```text
daily sales
payment splits
monthly costs
supplier purchases
stocktakes
rosters
```

### Phase F：Auth / Files / Incremental Sync

```text
auth.users + profiles
Storage objects + checksum
snapshot_at 后新增／修改记录
final reconciliation
```

## 8. 审批清单

请逐项选择：

- [ ] `a_order` 使用单表 `document_type`。
- [ ] `a_order` 拆分 `quotes` 与 `orders`。
- [ ] `a_customers` 与 `m_customer` 保持分开。
- [ ] `a_customers` 与 `m_customer` 建立 dedup mapping。
- [ ] Package／Product junction 允许同一 pair 多行。
- [ ] BOM 使用版本表。
- [ ] BOM 使用订单快照。
- [ ] 库存采用 immutable movement ledger。
- [ ] Payment refund／void 采用 reversal。
- [ ] 空表结构保留。
- [ ] 空表签核排除。
- [ ] 18 个孤儿必须修复后才导入。
- [ ] 孤儿允许 nullable UUID FK + issue 记录。
- [ ] User 从 Bubble 受控获取。
- [ ] User 只根据 Email 重建，不获取旧记录。
- [ ] 同意按 Phase A → F 在 Supabase develop 试导入。

## 9. 当前建议

在未收到审批清单结果前：

- 不将本草案移入 `supabase/migrations/`；
- 不在 Supabase 建立业务表；
- 不写入任何 production 数据；
- 只保留快照、报告和待确认决策。
