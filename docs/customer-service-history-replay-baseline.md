# 歷史回放 HR-01 基線報告

> 日期：2026-09-19｜狀態：唯讀盤點完成｜未部署 production、未匯入真人資料、未開啟 live。

對應規格：`docs/customer-service-history-replay-safe-remediation.spec.md`。本報告只記錄核對結果與差異，不是效益或安全結論。

## 環境與版本

- 分支：`develop`，基線 commit `56b5a8a2`（規格參考的 `f0b917a` 較舊）。
- 開發資料庫：`mxiueauyylnpwlxrvgbo`；production：`vignxasvlxqnyvuhtjlu`（本輪未觸碰）。
- embedding：`vector(1024)`、profile 為 64-hex SHA-256、revision/CAS 租約機制。

## B1 修復包套用狀態

`FCCD_RAG_All_Fixes_f0b917a.zip` 內檔案與現行 develop 一致，判定 B1 已套用：

- `20260918180000_customer_service_embedding_consistency.sql`（revision/profile/claim/release、v2 向量搜尋）
- `20260918181000_customer_service_rag_config_patch.sql`
- `customer-service-model-evaluate/index.ts`（共享 production FAQ 子流程、baseline 比較、RagTrace、小批 `offset`/`next_offset`、`customer_service_faq_index_snapshot`、forbidden deps）
- `_shared/customer-service-{grounding,embedding,rag-config,rag-runtime,rag-db,rag-evaluation,ai,rewrite}.ts`

## 現有 evaluator 覆蓋與缺口

- 樣本來源：`customer_service_test_cases`（active）與 `customer_service_turn_feedback`；**尚未**接歷史匯入。
- 覆蓋：production FAQ 子流程（`answerCustomerServiceFaqForEvaluation` = `replyFaq`），含檢索、composer、最終 guard。
- 缺口：未接 fallback（`answerCustomerServiceFallbackWithTieredAi` 存在但 evaluator 未呼叫）；未涵蓋 routing/handoff/業務執行/訊息輸送；無 `customer_service_history_*` 樣本。
- 相關符號已核對：`answerCustomerServiceFaqForEvaluation`、`ragAnswerTextSimilarity`、`ragRecallAtK`、`meanKnown`、`buildHumanLearningPairs`、`buildHumanLearningConversations`、`sanitizeCustomerServiceContextText`。

## 歷史匯入來源

- `customer_service_learning_import_messages`：`id, environment, phone_normalized, role, message_text, created_at, source_message_id`（`source_message_id` 為 `text`）。
- `customer_service_messages`：多 `conversation_id`（generated = `phone_normalized`）。
- 無 channel/session 欄位：同號跨渠道無法僅憑資料區分，缺失 session 證據時標 `pairing_uncertain`。
- burst 規則可復用：`customer-service-burst.ts`（quiet 2.5s／max 5s／10 則／6000 字）。

## 權限

- 編輯入口：`private.has_page_access('settings.customer_faq')` / `customer_service_edit_access_check`。
- 新表（HR-03）只授 `service_role`；anon/authenticated 全禁。

## 未知與未核項

- `customer-service-conversation-cases-phase1.compatibility-addendum.md` 未在本地取得，其 B1/B2 基線與 RG01–RG40 未逐條核對。
- 未量測實際 pgvector query plan、未跑真實模型、未驗證 production。
- Lineage（案例／alias 是否與歷史樣本共用來源）待 HR-05 隔離驗證時處理。
