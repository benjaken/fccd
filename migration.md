# 資料遷移頁面注意事項

本文件記錄目前已確認的 Bubble 資料盤點與後續遷移規則。未經重新確認，
不得擴大頁面功能或啟動寫入任務。

核心 Catering schema 评审草案：

- `docs/MIGRATION_SCHEMA_DRAFT.md`
- `docs/sql/001_core_catering_schema.draft.sql`
- `docs/FULL_MIGRATION_DATA_REPORT.md`
- `docs/FULL_SCHEMA_APPROVAL_DRAFT.md`
- `docs/SUPABASE_MAIN_MIGRATION_STATUS.md`

以上文件不在 `supabase/migrations/`，不会自动执行。

## 1. 目前範圍

- `/migration` 是獨立工作區，不加入營運系統選單；入口會 redirect 到
  `/migration/control`。
- 工作區包含兩個可直接路由的頁面：
  - `/migration/control`：Migration Control；
  - `/migration/fk`：FK Mapping、Bubble 實體掃描及關係圖。
- 頁面不需要 Supabase Auth 登入。
- 公開使用者可查看所有靜態狀態及執行唯讀 Bubble 掃描。
- 不建立、清空或寫入任何 Supabase 資料表。
- 先前的 `migration_*` staging 方式並非正確遷移方案，已取消。
- 真正遷移前必須重新確認目標資料模型、關聯、轉換及驗收方式。

## 2. Bubble 資料來源

- 只使用 production Data API：
  `https://cs.foodchannels-catering.com/api/1.1/obj`
- 不使用 `version-test` 作為資料來源。
- 資料類型名稱拼接到 Base URL 時必須使用 `encodeURIComponent`。
- 空格必須編碼為 `%20`，例如：
  `https://cs.foodchannels-catering.com/api/1.1/obj/B_delivery%20schedule`
- 目前盤點的 103 個資料類型以
  `src/data/bubble-object-types.ts` 為唯一前端清單。

## 3. 扫描结果判定

- HTTP/API 请求成功且记录数为 `0`，属于成功结果。
- 成功的空资料表显示为 `0 · 正常`／`0 · OK`。
- 只有网络错误、非 2xx API 响应或响应格式错误才显示失败。
- production 不存在的类型应如实显示接口失败，不能当作空资料表。
- 分组及整体百分比代表成功率，只使用「成功数 ÷ 资料表总数」计算；
  失败项目不计入成功百分比。
- 扫描只请求计数所需的最少资料，不在浏览器显示原始记录内容。

## 4. 实体分类与页面展示

- 实体分为「核心实体」及「其他实体」。
- 103 个实体按九个业务领域分组：
  1. 客户、CRM、渠道与提醒
  2. 报价、订单与备注
  3. 商品、套餐、菜单与标签
  4. 食材、包装与生产计算
  5. 配送与车队
  6. 付款、成本与采购
  7. 肉类加工与库存
  8. 店铺营运、销售、库存与排班
  9. 日历、状态、用户与系统
- 每组显示资料表总数、核心／其他数量、成功／失败数量及完成百分比。
- 分组可展开或收起；搜索时自动展开有匹配项目的分组。
- 资料表辅助文字、状态和日志必须保持清晰可读，不使用过小字体。

## 5. 执行日志

- 页面底部保留执行日志面板。
- 日志记录扫描开始、批次完成、单表成功及接口失败。
- 时间使用香港时区 `Asia/Hong_Kong`。
- 日志区支持滚动及手动清除。
- 最新日志显示在最上方。

## 6. 关系推断与验证

- Production Swagger 提炼后的实体、字段及显式 Unique ID 关系必须保存在项目中。
- 使用 `npm run generate:bubble-schema` 重新生成
  `src/data/bubble-schema.generated.json`。
- 页面可针对单一资料表执行关系分析，但实际记录只允许在 Edge Function
  内读取。
- 公开页面只显示聚合结果：来源字段、目标实体、候选基数、置信度、验证数量、
  孤儿引用数量及建议 Supabase 字段。
- 不向浏览器传回客户、订单、付款、员工等原始 JSON。
- 单次关系验证最多读取 100 笔来源样本，每个字段最多验证 10 个目标 ID。
- 抽样结果只能用于确认候选关系，不能代替正式迁移前的全量孤儿数据及财务对账。
- Data API 类型超过 50,000 笔时，导出工具必须按 `Created Date` 分区；
  `remaining > 0` 但结果为空时必须报错，不能标记为完成。
- 每个分区完成后检查预期数量，并以 Bubble `_id` 做跨分区去重。
- 全量报告必须固定一个 UTC `snapshot_at`，所有类型统一加入
  `Created Date < snapshot_at` 条件；快照后的新增记录进入后续增量同步，
  不能在全量导出期间不断改变预期数量。
- 五年历史固定点为香港时间 `2021-08-12 00:00:00 +08:00`
  （UTC `2021-08-11T16:00:00.000Z`），记录在
  `config/migration-policy.json`，后续不得随执行日期滚动。
- `Created Date < historicalCutoffUtc` 属于 historical baseline，只处理一次；
  baseline 成功后保存 checkpoint，后续自动跳过。
- `Created Date >= historicalCutoffUtc` 属于 active dataset；首次完整导入后，
  后续只处理 `Modified Date > lastSuccessfulCheckpoint` 的增量。
- 数组型 Unique ID 先标记为候选多对多；单值 Unique ID 依重复情况推断为
  多对一或候选一对一。
- 关系图用于人工检查方向与基数，不自动建立 Supabase foreign key。
- 迁移控制页必须列出全部 98 个 production 类型及其 Supabase 目标表、
  迁移策略、来源数量、已迁移、剩余、错误和完成率。
- 资料表迁移率与记录迁移率分开计算；导出完成不能当作已迁移。
- 当前错误分为已导入数据问题、待对账及未开始，不能全部合并为失败。

## 7. Supabase 与部署

- 开发部署使用 Git `develop` 分支。
- 前端通过 Vercel/Supabase 分支环境变量连接对应的 Supabase
  `develop` preview branch。
- 浏览器只能使用 publishable key，不得使用 secret 或
  `service_role` key。
- 目前只保留唯读 `bubble-scan` Edge Function。
- `bubble-relations` 是无状态唯读分析函数；Supabase preview branch 尚未部署时，
  前端可回退到 main Function。该函数不查询 main 数据库，只读取 production
  Bubble 并返回聚合关系结果。
- 已取消的 `bubble-migrate` endpoint 只保留 HTTP 410 tombstone，
  防止旧部署继续执行错误任务。

### 7.1 Migration Control dashboard

- Dashboard 的階段數量、UUID FK 狀態、快照及 blockers 是
  `docs/SUPABASE_MAIN_MIGRATION_STATUS.md` 的靜態核實聚合資料；不是即時
  database health check。
- 固定 historical cutoff 為 `2021-08-12 00:00:00 +08:00`。Historical
  baseline 只執行一次；active dataset 以
  `Modified Date > lastSuccessfulCheckpoint` 增量。
- Phase A/B/C/D1 顯示已導入數量。Phase C 在完成 Modified Date 增量及財務
  對帳前標記為「待增量對帳」。
- FK Mapping 必須清楚區分：
  - `database verified`：Supabase main 已完成 UUID FK、constraint 或 aggregate
    對帳；
  - `inferred / sample verified`：Swagger 推斷及 Bubble 抽樣，只作候選 mapping。
- 已遷移範圍的 aggregate unresolved UUID FK 為 0；D1 仍有一個缺失
  `S_order` issue，影響 5 筆 nullable `order_line_id`。尚未遷移範圍另有
  18 個已知 orphan references，不得混稱為已解決。

### 7.2 寫入操作及切換閘門

- Full Migration、Incremental Sync、Resume 及 Switch to Supabase 只顯示預定
  control surface，不代表已有執行能力。
- 所有寫入操作需要目前 Supabase session 的可信
  `app_metadata.role === "Super Admin"`；不得使用 `user_metadata` 或 profile
  display role 作授權。
- 前端角色鎖不是最終授權。未來 handler 必須在受信任 server/worker 再驗證
  JWT，並以 service role 存取 default-deny registry tables。
- 在 durable queue/worker、server handlers 及完整 mappings 尚未完成時，所有
  寫入控制保持 disabled，並顯示明確原因，不在前端模擬成功。
- Full Migration 額外要求 schema 及所有 domain readiness gates 完成。
- Switch to Supabase 額外要求：
  - 所有 domain 及 schema 已核准並完成；
  - Modified Date incremental 與財務 reconciliation 完成；
  - orphan disposition 完成；
  - Auth、files 及 checksum reconciliation 完成；
  - durable backend handlers 完成。
- Review-only migration `migration_control_registry` 定義 entities、jobs、
  per-entity checkpoints/tasks、FK mapping/issues 及 singleton data source。
  所有表 RLS default-deny，只授權 `service_role`；在 worker security review 前
  不可套用到遠端。

## 8. 后续真实迁移的前置条件

- 不可把所有 Bubble 类型机械复制为同名业务表。
- 必须先确认核心实体、其他实体、关联及最终 Supabase schema。
- Bubble `_id` 不是标准 UUID，不能直接 cast 成 PostgreSQL `uuid`。
- 每个目标实体使用新的 `id uuid primary key default gen_random_uuid()`。
- 同一笔资料保留 `legacy_id text unique not null`，绑定原 Bubble `_id`。
- Bubble 单值引用先保存为 `xxx_legacy_id text`，再通过目标表
  `legacy_id` 查出 UUID，写入 `xxx_id uuid` foreign key。
- Bubble 数组引用转换为 junction table；junction 两端使用 UUID foreign key，
  并在迁移对账期间保留原始 Bubble ID。
- 所有 UUID 外键建立前必须完成 legacy ID crosswalk、孤儿引用报告及目标唯一性检查。
- 示例：`a_order.A_customer` 的原始值先放入
  `orders.customer_legacy_id`，解析后写入
  `orders.customer_id uuid references customers(id)`。
- 金额使用 PostgreSQL `numeric`，日期时间保留时区。
- 订单客户、价格、地址及条款需要保留交易快照。
- 关系字段完成资料分析后再建立 PostgreSQL foreign key。
- `user.pw` 不得写入数据库、日志、备份或导出。
- 正式迁移必须具备来源数量、成功、跳过、失败及关系孤儿对账。

