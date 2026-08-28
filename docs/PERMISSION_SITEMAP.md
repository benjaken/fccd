# FCCD 页面与按钮权限 Sitemap

> 代码快照：2026-08-28
> 核对来源：`src/App.tsx`、`src/lib/nav.ts`、`src/auth/use-page-access.ts`、页面组件及 Supabase 权限迁移。
> 本文描述“当前代码实际上怎样控制”，不代表建议方案。角色的实际开关值以 `role_page_permissions` 表为准。

## 1. 权限模型

当前角色：`Super Admin`、`Admin`、`Accounting`、`Factory`、`Shop manager`、`Customer_Main`、`Customer_Sub`、`Company User`。

| 标记 | 数据字段 / 判断 | 实际含义 |
| --- | --- | --- |
| A | `can_access` / `canAccess(key)` | 显示菜单、允许进入页面，或允许一个细粒度 action |
| M | `can_manage` / `canManage(key)` | 页面内建立、编辑、删除等综合管理操作 |
| T | token / anonymous flow | 不使用后台角色页面权限，以一次性 token、登录码或公开流程控制 |
| — | 无单独权限 | 沿用父页面权限，或只是重定向 / 只读详情 |

权限继承规则：在权限编辑器勾选父级 A，会勾选全部二级、三级 A；勾选父级 M，会勾选全部二级、三级 M，并打开其下 action A。取消父级 A 会关闭整个分支的 A/M；取消父级 M 会关闭整个分支的 M 和 action A，但保留普通页面 A。父级 A 关闭时，子页面即使遗留 A=true 也不能越权。Action 类型权限目前存放在同一张权限表中，前端使用 `canAccess(actionKey)` 判断。

## 2. 页面 Sitemap

### 全局与独立工作区

| 页面 | 路由 | 进入权限 | 页面内写操作 |
| --- | --- | --- | --- |
| 登录 | 未登录时的默认页 | T | 登录流程 |
| 重置密码 | `/reset-password` | T | 重置 token |
| 个人资料 | `/profile` | 固定可访问 | 当前用户本人 |
| 数据迁移 | `/migration/*` | A `migration` | M `migration` |
| 客户自助查询 | `/self_service_search` | T | 手机 / 邮箱验证后的自助 session |
| 客户工作区占位页 | `/customer/*` | A `workspace.customer.portal`，旧库回退 `workspace.customer` | 当前导航仍禁用 |
| 工场版面 | `/factory` | A `workspace.factory.board`，旧库回退 `workspace.factory` | 业务 RPC 再校验 |
| 工场订单 | `/factory/order/:deliveryId` | A `workspace.factory.order`，旧库回退父级 | 业务 RPC 再校验 |
| 凍肉送货单 | `/factory/meat-delivery-note/:meatOrderId` | A `workspace.factory.meat_delivery_note`，旧库回退父级 | 业务 RPC 再校验 |
| 多日餐单 | `/factory/multi-day-menu` | A `workspace.factory.multi_day_menu`，旧库回退父级 | 以页面访问为主 |
| 工场生产日历 | `/factory/production-calendar` | A `workspace.factory.production_calendar`，旧库回退父级 | 以页面访问为主 |
| 司机送货首页 | `/driver-delivery` | 登录用户 A `workspace.delivery`；未登录可进入 token flow | T / 业务 RPC |
| 可接订单 | `/driver-delivery/available` | A `workspace.delivery.available`；匿名 token flow | T / 业务 RPC |
| 已接订单 | `/driver-delivery/accepted` | A `workspace.delivery.accepted`；匿名 token flow | T / 业务 RPC |
| 车队、收入、地区、设置 | `/driver-delivery/{fleet|income|districts|settings}` | 对应 A `workspace.delivery.{fleet|income|districts|settings}`；匿名 token flow | T / 业务 RPC |

### 主页面与跟进

| 页面 | 路由 | 进入权限 | 按钮 / 操作权限 |
| --- | --- | --- | --- |
| 主页面 | `/` | A `overview` | 快捷卡分别再检查目标页面权限 |
| 营运跟进 | `/follow-up` | A `overview.follow_up` | 快捷卡分别检查 `quotes`、`finance`、`delivery`、`inventory` 等 |
| 低库存占位页 | `/inventory/low-stock` | A `inventory` | 当前落入通用占位页 |

### 订单

| 页面 / 分组 | 路由 | 进入权限 | 按钮 / 操作权限 |
| --- | --- | --- | --- |
| 所有订单 | `/orders` | A `orders` | 新建、编辑、复制、状态类写操作：M `orders` |
| Shopify 待处理 | `/orders/shopify-pending` | A `orders.shopify_pending` | 列表操作仍由 M `orders` 传入 |
| 待确认 | `/orders/pending` | A `orders.pending` | M `orders` |
| 未发送工场 | `/orders/not-sent-factory` | A `orders.not_sent_factory` | M `orders` |
| 未付款 | `/orders/unpaid` | A `orders.unpaid` | M `orders`；财务字段另需 A `finance` |
| 已送货未付款 | `/orders/delivered-unpaid` | A `orders.delivered_unpaid` | M `orders`；未放在侧栏 |
| 月度、拆单、厨房备注、待改期 | `/orders/{monthly|split|kitchen-notes|reschedule-pending}` | 对应 A `orders.{monthly|split|kitchen_notes|reschedule_pending}` | M `orders` |
| 收款到帐 | `/orders/payments/bank-arrival-date` | A `orders.payments` | M `orders.payments` |
| Masoft 发票收据 | `/orders/payments/masoft-invoices` | A `orders.payments` | M `orders.payments` |
| 生产日历 | `/orders/calendar`、`/orders/production` | A `kitchen.calendar` | 页面业务逻辑 |
| 新建订单 | `/orders/new` | A `orders.new`（路由实际还要求 M `orders`） | M `orders` |
| 订单查看 | `/orders/:id` | A `orders` | 只读；编辑入口要求 M `orders` |
| 订单编辑 | `/orders/:id/edit` | A `orders` + M `orders` | M `orders` |
| 收据 / 发票编辑器 | `/orders/:id/{receipt|invoice}` | A `orders` + M `orders` | M `orders` |

订单设置：

| 设置页 | 路由 | 进入权限 | 按钮 / 操作权限 |
| --- | --- | --- | --- |
| 电邮通知 | `/orders/settings/email-notifications` | A `orders.settings.email_notifications` | M 同 key |
| 首次通知收件人 | `/orders/settings/first-notification-recipients` | A `orders.settings.first_notification_recipients` | M 同 key |
| 销售伙伴 | `/orders/settings/sale-partners` | A `orders.settings.sale_partners` | A `.create` / `.edit` / `.delete` |
| 订单状态 | `/orders/settings/statuses` | A `orders.settings.statuses` | A `.create` / `.edit` / `.delete` |
| 标签、客户标签、成本选项、供应商支出、报价来源、沟通渠道、节日、条款、报价付款模板、送货方式、付款方式 | `/orders/settings/:tab` | A `orders.settings` | M `orders.settings` |
| 运费 | `/orders/settings/shipping-fees` | A `orders.settings.shipping_fees` | M 同 key |
| 加购项 | `/orders/settings/add-ons` | A `orders.settings.addons` | M 同 key |
| 加购封锁日期 | `/orders/settings/add-on-block-dates` | A `orders.settings.addon_block_dates` | M 同 key |
| 订单列表提示 | `/orders/settings/order-list-tips` | A `settings.order_lists` | A `settings.order_lists.edit` |

### 报价

| 页面 | 路由 | 进入权限 | 按钮 / 操作权限 |
| --- | --- | --- | --- |
| 报价列表 | `/quotes` | A `quotes` | 新建、编辑、PDF、复制、描述：M `quotes` |
| 高机会 / 大单 | `/quotes/high-chance`、`/quotes/large` | A `quotes` | M `quotes` |
| 待跟进 | `/quotes/pending`（`/quotes/follow-up` 重定向） | A `quotes.pending` | M `quotes` |
| 即将到期 | `/quotes/upcoming` | A `quotes.upcoming` | M `quotes`；未放在侧栏 |
| 报价客户 | `/quotes/customers` | A `quotes.customers` | M `quotes.customers` |
| PDF 页面设置 | `/quotes/pdf-pages` | A `quotes.pdf_pages` | M `quotes.pdf_pages` |
| 新建 / 编辑 / PDF 编辑 | `/quotes/new`、`/quotes/:id/edit`、`/quotes/:id/pdf` | A `quotes` + M `quotes` | M `quotes` |
| 报价查看 | `/quotes/:id` | A `quotes` | 只读 |

### 产品

| 页面 | 路由 | 进入权限 | 按钮 / 操作权限 |
| --- | --- | --- | --- |
| 所有产品 | `/products` | A `products` | 新建 / 编辑：M `products`；新建套餐：M `products.packages` |
| 到会、饭盒、单点 | `/products/{catering|lunchbox|ala-carte}` | 对应 A `products.{catering|lunchbox|ala_carte}` | M `products` |
| 套餐 | `/products/packages` | A `products.packages` | M `products.packages` |
| 产品新建 / 查看 / 编辑 | `/products/new`、`/products/:id`、`/products/:id/edit` | A `products` | M `products` |
| 套餐新建 / 查看 / 编辑 | `/products/packages/new`、`/products/packages/:id`、`.../:id/edit` | A `products.packages` | M `products.packages` |
| Shopify 产品审批 | `/products/shopify-pending`、`.../:id` | A `products.shopify_pending` | M `products.shopify_pending` |

### 凍货

| 页面 | 路由 | 进入权限 | 按钮 / 操作权限 |
| --- | --- | --- | --- |
| 生肉库存 | `/frozen/raw-meat-inventory` | A `frozen.raw_meat_inventory` | 新建 A `.create`；编辑 A `.edit`；入库 A `.stock_in` |
| 制成品库存 | `/frozen/prepared-meat-inventory` | A `frozen.prepared_meat_inventory` | M 同 key |
| 售价成本 | `/frozen/selling-price-cost` | A `frozen.selling_price_cost` | 推送 A `.push` |
| 送货单 | `/frozen/delivery-notes` | A `frozen.delivery_notes` | M 同 key |
| 固定香料成本 | `/frozen/seasoning-cost` | A `frozen.seasoning_cost` | A `.edit` / `.delete` |
| 计算设置 | `/frozen/calculation-settings` | A `frozen.calculation_settings` | 删除 A `.delete`；其他写入沿用页面能力 |
| 凍肉客户 | `/frozen/customers` | A `frozen.meat_customers` | A `.edit` / `.delete` |
| 香料用量 | `/frozen/spice-usage` | A `frozen.spice_usage` | 删除 A `.delete` |
| 产率异常 | `/frozen/yield-errors` | A `frozen.yield_errors` | 当前以页面访问为主 |
| 供应商报价 | `/frozen/supplier-quotes` | A `frozen.supplier_quotes` | 上传 A `.upload`；复核 / 重识别 A `.review`；CSV/PDF A `.export`；门槛设置 A `.settings` |

### 中央厨房

| 页面 | 路由 | 进入权限 | 按钮 / 操作权限 |
| --- | --- | --- | --- |
| 厨房订单 | `/kitchen` | A `kitchen` | 页面业务逻辑 |
| 厨房日历 | `/kitchen/calendar` | A `kitchen.calendar` | 页面业务逻辑 |
| 食材 | `/kitchen/ingredients` | A `kitchen.ingredients` | A `.edit` / `.delete` |
| 供应商 | `/kitchen/suppliers` | A `kitchen.suppliers` | 查看详情 A `.view_detail`；编辑 A `.edit`；删除 A `.delete` |
| 包装盘点 | `/kitchen/packing-stocktakes` | A `kitchen.packing_stocktakes` | A `.edit` / `.delete` |
| 食材盘点 | `/kitchen/ingredient-stocktakes` | A `kitchen.ingredient_stocktakes` | A `.edit` / `.delete` |
| 物料用量 | `/kitchen/material-usage` | A `kitchen.material_usage` | 当前以页面访问为主 |
| 厨房设置 | `/kitchen/settings` | A `kitchen.settings` | 烹调类型删除 A `kitchen.settings.cook_types.delete` |
| 成本输入 | `/finance/cost-input`（旧 `/kitchen/cost-input` 重定向） | A `kitchen.cost_input` | A `kitchen.cost_input.edit` |

### 配送

| 页面 | 路由 | 进入权限 | 按钮 / 操作权限 |
| --- | --- | --- | --- |
| 配送列表 | `/delivery` | A `delivery` | 编辑配送：M `delivery` |
| 安排司机 | `/delivery/assign` | A `delivery.assign` | 当前以页面访问 + RPC 为主 |
| 车队管理 | `/delivery/fleets` | A `delivery.fleets` | M `delivery.fleets` |
| 附加费设置 | `/delivery/surcharges` | A `delivery` | M `delivery`（没有独立 page key） |

### 餐厅

| 页面 | 路由 | 进入权限 | 按钮 / 操作权限 |
| --- | --- | --- | --- |
| 每日销售 | `/restaurant/daily-sales` | A `restaurant.daily_sales` | A `.edit` |
| 每日采购 | `/restaurant/daily-purchases` | A `restaurant.daily_purchases` | A `.edit` |
| 库存盘点 | `/restaurant/inventory` | A `restaurant.inventory` | A `.edit` / `.delete` |
| 月度支出 | `/restaurant/monthly-expenses` | A `restaurant.monthly_expenses` | A `.edit` |
| 销售报告 | `/restaurant/reports` | A `restaurant.reports` | 只读；当前未放在餐厅侧栏 |
| 员工 | `/restaurant/staff` | A `restaurant.staff` | A `.edit` |

餐厅设置统一要求父级 A `restaurant.settings`，子项如下：

| 设置页 | page key | 按钮 / 操作权限 |
| --- | --- | --- |
| 餐厅 | `restaurant.settings.restaurants` | A `.edit` / `.delete` |
| 部门 | `restaurant.settings.departments` | A `.edit` / `.delete` |
| 时段 | `restaurant.settings.service_periods` | A `.edit` / `.delete` |
| 付款方式 | `restaurant.settings.payment_methods` | A `.edit` / `.delete` |
| 外卖平台 | `restaurant.settings.delivery_platforms` | A `.edit` / `.delete` |
| 假期 | `restaurant.settings.holidays` | A `.edit` / `.delete` |
| 更表时间 | `restaurant.settings.roster_times` | A `.edit` / `.delete` |
| 供应商成本分类 | `restaurant.settings.supplier_cost_categories` | A `.edit` / `.delete` |
| 库存项目 | `restaurant.settings.inventory_items` | A `.edit` / `.delete` |
| 月度 P&L 成本分类 | `restaurant.settings.monthly_pnl_cost_categories` | A `.edit` / `.delete` |
| 新产品设置 | `restaurant.settings.new_products` | A `.edit` / `.delete`，但当前没有 App 路由和菜单入口 |

### 报告与财务

| 页面 / Tab | 路由 | 进入权限 | 按钮 / 操作权限 |
| --- | --- | --- | --- |
| 数据输入进度 | `/reports/data-input-progress` | A `reports.data_input_progress` | 只读 |
| 厨房销售成本 | `/reports/kitchen` | A `kitchen.cost_input` | 报表本身只读 |
| 厨房产品销售 | `/reports/kitchen/product-sales` | A `kitchen.cost_input` | 只读 |
| 厨房渠道销售 | `/reports/kitchen/channel-sales` | A `kitchen.cost_input` | 只读 |
| 厨房广告表现 | `/reports/kitchen/advertising-performance` | A `kitchen.cost_input` | 只读 |
| 商店订单数量 | `/reports/frozen-meat` | A `reports.shop_order_quantities` | 导出随页面访问开放 |
| 平均供应价 | `/reports/frozen-meat/average-supply-price` | A `reports.average_supply_price` | 导出随页面访问开放 |
| 生产成本价 | `/reports/frozen-meat/production-cost-price` | A `reports.production_cost_price` | 导出随页面访问开放 |
| 生肉平均价 | `/reports/frozen-meat/raw-meat-average-price` | A `reports.raw_meat_average_price` | 导出随页面访问开放 |
| 制成品库存 | `/reports/frozen-meat/prepared-meat-stock` | A `reports.prepared_meat_stock` | 导出随页面访问开放 |
| 生肉库存 | `/reports/frozen-meat/raw-meat-stock` | A `reports.raw_meat_stock` | 导出随页面访问开放 |
| 供应商采购 | `/reports/frozen-meat/supplier-purchase` | A `reports.supplier_purchase` | 导出随页面访问开放 |
| 商店销售 | `/reports/shops` | A `reports.shop_sales` | 导出随页面访问开放 |
| 销售工时 | `/reports/shops/sales-working-hours` | A `reports.shop_sales_working_hours` | 导出随页面访问开放 |
| 销售薪酬 | `/reports/shops/sales-salary` | A `reports.restaurant_sales_salary` | 导出随页面访问开放 |
| 销售成本 | `/reports/shops/sales-cost` | A `reports.restaurant_sales_cost` | 导出随页面访问开放 |
| P&L | `/reports/shops/pnl` | A `reports.restaurant_pnl` | 导出随页面访问开放 |
| 新产品报告 | `/reports/shops/new-products` | A `reports.new_products` | 导出随页面访问开放 |

### 系统设置

| 页面 | 路由 | 进入权限 | 按钮 / 操作权限 |
| --- | --- | --- | --- |
| 公司员工 | `/settings/employees` | A `settings.employees` | 邀请按钮直接随页面访问开放 |
| 用户 | `/settings/users` | A `settings.users` | 新建 A `.create`；编辑 A `.edit`；改密码 A `.change_password` |
| 角色与权限 | `/settings/roles` | A `settings.roles` | 前端开关直接随页面访问开放；数据库仍只允许 Super Admin 写 |
| 登录记录 | `/settings/login-logs` | A `settings.login_logs` | 只读 |
| 字典 | `/settings/dictionaries` | A `settings.dictionaries` | A `.edit` |
| 通知设置 | `/settings/notifications` | A `settings.notifications` | 保存按钮直接随页面访问开放 |
| 配送地区 | `/settings/districts` | A `settings.districts` | A `.edit` |
| 附件 | `/settings/attachments` | A `settings.attachments` | 当前只读管理列表 |
| 订单列表设置旧链接 | `/settings/order-lists` | A `settings.order_lists` | 重定向至订单设置 |

## 3. 待确认的问题

按当前代码交叉核对，建议优先确认以下项目：

1. **角色与权限页只有 A，没有前端 M 控制。** 任何获准进入 `settings.roles` 的角色都会看到并可操作开关，但数据库 RLS 只允许 `Super Admin` 写；非 Super Admin 会在保存时失败。建议新增 M 判断或明确将该页面只授予 Super Admin。
2. **`restaurant.settings.new_products` 是孤儿权限。** 权限 key、组件及 `pageAccessKey` 都存在，但 `App.tsx` 没有对应 Route，餐厅菜单也没有入口。
3. **`orders.drivers` 是孤儿入口。** 权限映射和 section child 仍存在，但没有 Route、菜单或实际页面；直接访问会进入通用占位页。
4. **`inventory` / `/inventory/low-stock` 仍是占位页。** 跟进卡可显示并跳转，但没有真正的库存页面 Route。
5. **餐厅销售报告有 Route 和权限，但没有侧栏入口。** `/restaurant/reports` 只能直接访问。
6. **四个厨房报表共用 `kitchen.cost_input`。** 查看产品销售、渠道销售、广告表现也要拥有“成本输入”页面权限；如果需要把报表查看和成本录入分开，应建立独立 report keys。
7. **公司员工邀请、通知设置保存采用“可进入即能写”。** 两页没有 M 或 action key；需要确认这是否符合预期。
8. **配送附加费没有独立权限。** `/delivery/surcharges` 复用 A/M `delivery`，无法只授权附加费维护或只授权配送列表。
9. **部分按钮权限粒度不一致。** 同一系统同时使用 M（订单、报价、产品）和 action A（凍货、厨房、餐厅）。功能上可用，但角色权限页会较难理解，后续建议统一命名和展示方式。
10. **报表导出没有独立 action 权限。** 目前拥有报表 A 就能导出 CSV/PDF；如导出属于敏感操作，需要新增 `.export` action 并在服务端同步校验。

## 4. 核对口径

- 菜单隐藏和 Route gate 都属于前端体验控制，敏感写入仍应由 RLS / RPC / Edge Function 再校验。
- `can_manage` 只在明确调用 `canManage(key)` 的页面生效，不会自动替代 action key。
- 旧数据库没有工作区子权限行时，工场和司机工作区会回退到父级 permission key；新库有子权限后按子页面控制。
- 本文没有展开“每个角色当前到底勾了哪些权限”，因为那是数据库实时数据；本文先给出代码层面的页面和按钮到 permission key 的完整映射。
