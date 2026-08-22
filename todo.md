# TODO

更新时间：2026-08-22

## P0：数据库迁移（2026-08-22 已完成）

> 已通过 Supabase Management API 对照线上 `schema_migrations`、表结构、触发器、RPC 和历史数据。由于本机 Supabase CLI 缺少 Windows 对应执行组件，本次改用同一项目的管理 API 完成只读核对和事务式部署。

- [x] 连接目标 Supabase 项目，检查线上 migration 历史和当前表／函数定义。
- [x] 核对并验证以下 migration：
  - [x] `20260821018000_kitchen_notes_use_packing_note.sql`
  - [x] `20260821019000_quote_editor_supports_orders.sql`
  - [x] `20260821020000_order_list_status_picker.sql`
  - [x] `20260821021000_order_factory_sent_at.sql`
  - [x] `20260821022000_reconcile_duplicate_shopify_payments.sql`
  - [x] `20260821023000_restore_kitchen_notes_wording.sql`
  - [x] `20260821024000_assign_web_order_numbers.sql`
  - [x] `20260821025000_backfill_unassigned_delivery_motorcades.sql`
  - [x] `20260821026000_order_do_not_send_to_factory.sql`
  - [x] `20260822000000_order_payment_status_sources.sql`
  - [x] `20260822001000_delivery_fleet_acceptance_workflow.sql`
- [x] 核对 `20260821017000_auto_close_expired_quote_follow_ups.sql`：线上函数定义与本地修正版一致，定时任务为每 5 分钟执行，无需追加 forward-only migration。
- [x] 部署 `20260822001000_delivery_fleet_acceptance_workflow.sql`，并核对 `deliveries.accepted_at`、2 个触发器及 9 个司机门户／后台 RPC 均存在。
- [x] 核对历史数据修复结果：已有取货或送达时间但缺少 `accepted_at` 的记录为 0，未误清真实取货时间。
- [x] 核对 `orders.delivery_status` 与关联 `deliveries`：配送记录不一致数为 0，订单汇总不一致数为 0。
- [x] 数据库已具备新字段和新 RPC，可上线对应前端版本。

## P1：配送流程剩余验证

- [ ] 使用真实测试数据库完整走一次：后台分配车队 → 车队可接单列表出现 → 车队接单 → 车队内部分配司机 → 确认取货 → 确认送达。
- [ ] 验证后台全程不依赖 `subdriver_id`：车队更换内部司机、删除内部司机或暂不派司机，都不应影响后台判断“已派车队／是否送达”。
- [ ] 验证车队拒单和重新派单：拒单后恢复“未派車隊”，后台重新分配同一或其他车队后，新车队能重新看到订单。
- [ ] 验证重复点击及并发操作：重复接单、重复取货、重复送达、后台同时改派车队时，不得产生重复状态或覆盖已完成记录。
- [ ] 验证已取货或已送达订单不能改派车队；已取消订单不能重新派车队。
- [ ] 验证一张订单有多条配送记录时，订单层状态汇总是否符合运营预期。目前采用“存在进行中的最高阶段”进行汇总，需要业务确认多车次场景。
- [ ] 增加数据库级集成测试。目前已有前端／静态保护测试，但尚未在本机实际 PostgreSQL 中执行新 migration 和 RPC。

## P1：报价、Shopify、付款及工场流程剩余验证

- [ ] 验证报价单转正式订单后，配送状态从报价阶段的 `Pending` 正确进入“未派車隊”，且不会把报价单本身提前送入配送流程。
- [ ] 验证 Shopify 新订单进入待审核列表、审核成为正式订单、建立配送记录、付款状态同步、送至工场的完整链路。
- [ ] 验证 Shopify 付款状态来源 migration：已链接 Shopify 的订单使用 Shopify financial status，本地订单继续使用人工付款／对账数据；特别检查部分付款、退款、取消及重复付款。
- [ ] 验证报价转订单时已收订金／付款记录和 `outstanding` 一致，避免复制付款后仍保留旧未付金额。
- [ ] 验证“送至工场／不传送到工场／修改后是否需要重印”的组合状态，确保订单、订单行和工场版面一致。
- [ ] 评估把后台订单保存改为单一数据库事务。当前订单、产品行、付款、配送和工场设置由多次请求保存，中途失败可能留下部分已保存的数据。
- [ ] 评估把报价编辑及相关配送／标签／金额保存改为单一数据库事务，避免其中一步失败造成资料不同步。

## P2：审计及运营可见性

- [ ] 增加配送状态历史记录：谁在何时分配／改派车队、车队何时接单／拒单、何时取货／送达。
- [ ] 后台可考虑显示“车队已接单时间”，但不显示或依赖车队内部具体司机。
- [ ] 为长时间停留在“待接單”“待取貨”的订单增加提醒或异常列表。

## 已知测试问题

- [x] `test/header-display.test.tsx` 当前 4/4 通过；旧记录中的显式 `13px` 字号问题已不再复现。
- [x] 完整测试曾因并发资源竞争令多条重交互案例超过默认 5 秒；已限制测试并发数，并统一设置 10 秒上限。当前完整测试 815/815 通过，类型检查及生产打包成功。
