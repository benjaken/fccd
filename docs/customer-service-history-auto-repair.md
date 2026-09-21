# 历史回放自动修复：运行边界

历史回放完成并判分后，界面的一键流程会继续执行自动诊断。只有检索遗漏、判分证据唯一指向已发布 FAQ、且该 FAQ 早于历史场景的样本，才会生成 FAQ 检索改写候选。历史真人答复只用于对比，不写入 FAQ 或正式答案。没有适用 FAQ 的样本可以由 AI 判断是否为可复用场景；结果进入场景指引候选，绝不变成 FAQ 内容。

场景分类器只能选择预先定义的意图、处理步骤和待确认资料。模型输出的自由文本会被丢弃，历史真人答复也不会变成政策事实或承诺。可信配对、完整上文和来源消息 ID 是生成场景候选的前置条件。

| 流程 | 可选场景 |
| --- | --- |
| 下单与报价 | 商品选择、下单资料收集、报价资料收集、订单确认 |
| 订单变更 | 更改餐点、更改数量、更改送货日期、更改送货地址、查询订单进度 |
| 付款 | 付款方式咨询、核对付款记录、未付款跟进 |
| 配送异常 | 送货延误、找不到送货地址、无人收货 |
| 售后 | 漏送、错送、品质投诉、取消订单请求、退款请求 |
| 文件 | 收据、发票、报价单需求 |
| 其他流程 | 催办跟进、特殊饮食或服务需求、转人工处理 |

取消及退款指引必须先查订单状态并安排人工接手；漏送、错送及品质投诉必须收集证据或转人工。场景只指导下一步，不宣称款项已退、订单已改、配送已完成，也不替代 FAQ 或业务资料。

候选在相同配置下对原样本、另一会话中的同问题样本和不同问题的对照样本做隔离回放。必须找到目标 FAQ、通过回答依据保护、对照样本无退化，才进入 `eligible`。缺少独立样本或正式依据时停在 `insufficient_evidence`。系统按 run 限制候选数，重复执行按样本和配置去重。

## R3 程式修改草稿

需要改程式（上下文遗漏、重复提问、金额日期守卫）的问题属 R3 `code_change_proposal`；覆盖不足、政策／产品错误及无依据承诺属 R2 runtime 通道（见下节）。系统**永不自动发布或套用** R3：`repair_execution` 白名单只放行 R1 索引恢复。R3 只会产生**待审查的最小 diff／PR 草稿**，由人工在本机套用并走正常 CI／PR。

流程：判定为 R3 → 管理员在修复记录按「产生程式修改草稿」→ 系统用判官建议产生结构化草稿（摘要、逐档 before／after、建议测试、风险），存回提案并标为 `drafted`；草稿从不写入程式、不执行 SQL、不推 PR。人工审查 diff 后可「核准」或「驳回」，核准后自行开 PR，并在记录填回 PR 链接以供稽核。

草稿路径只允许 `src/`、`supabase/`、`scripts/`、`docs/`、`test/` 下的相对路径；模型被明确告知没有仓库存取权，结果是 hypothesis，须人工核实。`draft_code_change` 需要 `CUSTOMER_SERVICE_AUTO_REPAIR_MODE` 为 `propose` 或 `apply_allowlist`；`off` 时不可产生草稿。此草稿能力不影响 R1 的自动生效白名单。

## R2 政策／意圖 runtime 修改

可由提示詞或政策描述修正的問題（覆蓋不足、政策／產品錯誤、無依據承諾）屬 R2 `runtime_policy_candidate`，與學習建議走同一條 runtime 通道，不需要改程式或開 PR。系統**永不自動套用**這類修改。

流程：判定為 R2 → 管理員在修復記錄按「產生政策／意圖修改草稿」→ 系統以判官建議及**現存**意圖、流程政策、回覆模板為限，產生結構化 patch（摘要、逐項 target／key／patch、建議驗證、風險），標為 `drafted`。管理員檢視後可「核准並套用」或「駁回」。套用由 `customer_service_repair_runtime_change_review`（security definer，只授予 `service_role`，經邊緣函式驗證 `settings.customer_faq.edit` 後呼叫）執行，只允許：

- `intent`：`description_append`、`examples_append`
- `reply_template`：`content`、`display_name`、`enabled`
- `workflow_policy`：`instructions_append`、`context_window`、`clarification_threshold`、`auto_resume`、`enabled`

清單與 `20260915143000_customer_service_learning_safety.sql` 完全一致，key 必須是現存資料列，未知 target／key 一律拒絕。套用前會逐項記錄 before 值於 `runtime_change_rollback` 供稽核；套用後 `status='applied'`，駁回則 `status='rejected'` 且不改動任何資料列。runtime 修改不支援自動撤回，需以新的草稿修正。

 `draft_runtime_change` 需要 `CUSTOMER_SERVICE_AUTO_REPAIR_MODE` 非 `off`。此通道不影響 R1 的自動生效白名單，也不改動 R3 的程式草稿路徑。

## 开关

- `CUSTOMER_SERVICE_HISTORY_EVAL_ENABLED=true`：允许启动和处理历史回放。
- `CUSTOMER_SERVICE_AUTO_REPAIR_MODE=off`：默认关闭自动诊断；`propose`：仅写诊断、候选与隔离验证；`apply_allowlist`：对**所有已发布（approved）FAQ** 的目标尝试自动生效。
- 授权范围：已发布（`is_published` 且 `locale='zh-HK'`）的 FAQ 即为授权目标，不需要维护 UUID 白名单。授权由数据库 `customer_service_verified_repair_target` 的发布状态判定，judge 或请求参数无法写入。FAQ 撤回或正文变化会立即失效。
- `CUSTOMER_SERVICE_AUTO_REPAIR_MAX_CANDIDATES_PER_RUN`：每次回放最多处理的候选，默认 3，上限 10。
- `CUSTOMER_SERVICE_AUTO_REPAIR_PAUSED=true`：暂停新的自动诊断与生效。
- `CUSTOMER_SERVICE_RAG_FORCE_OFF=true`：禁止自动生效；客服原有 RAG 抑制规则继续生效。
- `CUSTOMER_SERVICE_CASES_AUTO_INGEST=true`：将 AI 识别的可复用场景自动录入案例库 **draft**。默认关闭时，场景只保存在修复提案中。案例草稿不进入 FAQ，也不会自动成为线上回答依据。

生效时数据库会核对预授权、固定配置版本、FAQ 发布状态和正文摘要；规则先进入 canary，预览通过后才激活。线上检索只使用与用户问题匹配的规则和未变更的 FAQ 正文，返回的仍是原 FAQ 检索结果。FAQ 撤回或正文变化会使规则立即失效。修复记录提供紧急撤回；撤回仅改变本规则，不覆盖 FAQ 或人工修改。

本次交付没有修改生产环境开关或白名单，也没有部署数据库迁移。先在 develop 环境迁移并以 `propose` 观察，再为明确的 FAQ UUID 设置白名单和 `apply_allowlist`。
