# WeKnora 與 FCCD 智能客服答覆差距分析

日期：2026-09-18
範圍：WhatsApp 客服 AI（`supabase/functions/wati-customer-service` 及其 `_shared/customer-service-*.ts`）
性質：純分析，未改動任何程式碼

## 1. 結論摘要

FCCD 現時的智能答覆是「**FAQ 關鍵字檢索 + 受嚴格約束的改寫**」，而 WeKnora 是完整 RAG（**語義 + 關鍵字混合檢索、RRF 融合、Rerank 重排、查詢改寫、多輪上下文壓縮、引用溯源**）。兩者差距主要不在模型，而在**檢索質量**與**生成約束**：

1. **檢索**：FCCD 用 Postgres trigram／子字串比對（`pg_trgm`），沒有向量語義檢索、沒有 rerank、沒有中文分詞；同義詞、口語化、跨句改寫都會漏召回。
2. **知識形態**：FCCD FAQ 是單條「問題 + 答案 + keywords」，沒有相似問／反例問，也沒有長文分塊（chunk）。WeKnora 支援文件分塊、父子分塊、FAQ（標準問/相似問/反例問）、Wiki、知識圖譜。
3. **生成約束**：FCCD 明確要求「只准用命中 FAQ、不足就回 null」、數字必須有出處、來源 id 必須完全對應，導致答覆保守、簡短、易 fallback。WeKnora 用檢索片段綜合生成，容許組合與改寫。
4. **對話上下文**：FCCD 的分類器有帶 `recentMessages`，但 **FAQ 作答器沒有**（`answerFaqWithModel(query, candidates)`），無法用上文補全代詞／追問。WeKnora 有多輪上下文壓縮。
5. **查詢前處理**：FCCD 直接用客人原句（或固定 query），沒有查詢改寫／擴展／HyDE。WeKnora 有查詢改寫與擴展。

## 2. FCCD 現況架構（實測）

流程：意圖分類 → 路由 → FAQ 檢索 → 生成／決定性回覆 → 無命中則 handoff。

### 2.1 意圖分類
- 檔案：`supabase/functions/_shared/customer-service-intents.ts`、`customer-service-ai.ts:200`
- 先跑 Regex 硬規則（prompt injection 等），其餘交 LLM（`classifyCustomerServiceWithAi`）。
- 有傳 `recentMessages`（`customer-service-ai.ts:272`），dialogAction／pendingRequest 等狀態齊全。
- 這部分其實做得不錯，並非主要瓶頸。

### 2.2 FAQ 檢索
- 檔案：`_shared/customer-service-bot.ts:1534`、`wati-customer-service/index.ts:1791`
- RPC：`search_published_customer_faqs(p_query, p_limit)`
  - 最新版本：`supabase/migrations/20260914162000_customer_service_faq_match_scoring.sql`
  - 評分 = 完全比對(10) + 子字串(5/4) + keyword 命中數(0.25~6) + answer 子字串(2) + `similarity()*3`，門檻 `>= 0.50`。
- **只有** `pg_trgm` 的 trigram similarity 與 `ILIKE`；**無 embedding、無 vector、無 BM25、無 rerank、無中文分詞**。
- 命中後再用 `strongPublishedFaqMatch`（`customer-service-bot.ts:795`）做規則過濾，只有強命中才可作決定性原樣回覆。

### 2.3 生成／回答
- 檔案：`_shared/customer-service-ai.ts:320` `answerCustomerServiceFaqWithAi`
- 提示詞要求：
  - "Answer only from the published FAQ records"
  - "never add facts, prices, dates, URLs, policies, or promises not present"
  - "If the records are insufficient, ambiguous... return answer null"
  - 來源 id 必須全部存在且不多不少（`parseProviderAnswer:314`）
  - 數字必須在來源出現（`answerNumbersAreGrounded:127`）
  - 回覆上限 1200 字、`max_tokens: 500`
- **作答器只收到 `question` 與 `publishedFaqs`，沒有 `recentMessages`**（`index.ts:2050` → `answerFaqWithModel` 只傳 query + candidates）。
- 弱命中時，模型答案必須附有效來源 id 才可採用（`customer-service-bot.ts:1555`）。
- 完全無命中 → `answerCustomerServiceFallbackWithAi`（`customer-service-ai.ts:437`），此處才有 `recentMessages`。

### 2.4 知識管理
- 表：`public.customer_faqs(category, question, answer, keywords, is_published, sort_order)`（`20260904120000_whatsapp_customer_service_faq.sql:28`）
- 沒有「相似問」「反例問」「chunk」「embedding vector」欄位。
- 有學習／建議機制（`customer-service-learning.ts`），但偏重「由真人對話生成新 FAQ」與 alias，非檢索算法升級。

## 3. WeKnora 做法（官方文件整理）

- 定位：騰訊開源 LLM 知識庫問答框架（Go 後端 + Vue 3 + Python docreader），MIT。
- 檢索管線：
  - 向量 + 關鍵詞（BM25）**混合檢索**，**RRF 融合**，**Rerank 重排**
  - **查詢改寫與擴展**、意圖識別（greeting/chitchat/web_search…）
  - 可選 **GraphRAG**、Wiki 導航
- 知識形態：
  - 文件解析（PDF 版式、OCR、表格、VLM 圖片描述、ASR）
  - **可配置分塊**（含父子分塊、自適應策略）
  - **FAQ 能力**：標準問、相似問、反例問、答案
- 對話：
  - **多輪上下文壓縮**、串流 SSE、**引用溯源**
  - ReAct Agent（可編排檢索／MCP／Web 搜索／數據分析）
  - **跨會話長期記憶**（預設關閉）
- 工程：ParadeDB（PG17 + BM25 + 向量）或缺省多種向量庫；Langfuse 追蹤；多租戶 RBAC。

## 4. 差距對照表

| 維度 | FCCD 現況 | WeKnora | 影響 |
|---|---|---|---|
| 召回方式 | trigram + ILIKE + keyword | 向量 + BM25 混合、RRF | 同義/口語/改寫易漏 |
| 重排 | 無 | Rerank 模型 | Top-N 不準，干擾生成 |
| 查詢處理 | 原句／固定 query | 改寫、擴展 | 短問句、代詞追問差 |
| 知識單位 | 整條 Q/A | 文件 chunk（父子）、FAQ 三型 | 長內容被截斷、答得薄 |
| 相似問/反例 | 無（只有 keywords） | 有 | 口語變體覆蓋低 |
| 生成約束 | 只准 FAQ、不足回 null、數字硬性 grounded | 依檢索片段綜合 | 保守、易罐頭、易 fallback |
| 對話上下文 | 分類有、**FAQ 作答無** | 多輪壓縮 | 追問／代詞接不上 |
| 引用 | sourceIds 嚴格校驗 | 引用抽屜/彈窗 | FCCD 較可信但更易拒答 |
| 評估 | 有回歸測試＋模型評估 | 內建評估能力 | FCCD 尚可 |
| 部署 | Supabase Edge Functions | 自架容器 | 整合成本差異大 |

## 5. 為何 WeKnora 答得更好（根因排序）

1. **語義召回**：向量 + BM25 混合能命中「字面唔同但意思相同」的問題；FCCD 靠 trigram，中文同義詞幾乎無效。
2. **Rerank**：把真正相關片段推上前面，生成不被相似但不相關的 FAQ 干擾。
3. **知識粒度與覆蓋**：chunk + 相似問/反例問讓答案有更多可用素材；FCCD 單條 FAQ 一改寫就無料可用。
4. **生成自由度**：FCCD 的「不足即 null」在檢索弱時直接把問題推去人工；WeKnora 可在片段基礎上組織答案。
5. **上下文**：FAQ 作答器缺 `recentMessages`，令追問／承接明顯變差。
6. **查詢改寫**：WeKnora 先把口語問題正規化，FCCD 直接拿去比對。

## 6. 可落地方案（由輕到重）

### 方案 A：最低成本，先補上下文與提示詞（1–2 日）
- `answerFaqWithModel` 加傳 `recentMessages`，作答器 prompt 加入對話上下文。
- 放寬「必須完全引用才作答」為「至少一個有效來源即可」，保留數字 grounded，但容許條件式說明。
- 調整 `retrieval_limit`（現預設表 3）與相似度門檻，先觀察召回。
- 覆蓋：**部分**；不解決語義召回。

### 方案 B：升級自家檢索（1–2 週，推薦）
- `customer_faqs` 加 `embedding vector(1536)` + `pgvector` HNSW 索引；對 question/keywords/answer 做嵌入。
- 檢索改為「向量 + trigram/全文」混合，加 RRF；有預算可加 rerank（或用 LLM 做 cross-encoder 式重排）。
- FAQ 加「相似問」欄位（`customer_faq_aliases` 表），支援口語變體與反例。
- 查詢改寫：作答前用小模型改寫客人問題成標準問。
- 覆蓋：**大部分**，且沿用 Supabase、回歸測試與評估管線，風險可控。

### 方案 C：接入 WeKnora 作檢索／問答後端（2–4 週＋維運）
- 用 WeKnora REST API（`weknora_search` / `weknora_ask`）取代 `searchFaqs` 或整段 FAQ 作答。
- 知識改放 WeKnora 知識庫（文件 + FAQ 三型），FCCD 只做意圖分類、建單、handoff 等業務動作。
- 優點：直接獲得混合檢索 + rerank + 多輪 + 引用。
- 風險：多一套自架服務（Docker）、資料同步、延遲、隱私（客人問題外送第三方 KB）、故障隔離、成本。需要確認 WeKnora 部署位置與資料合規。

### 建議路線
先做 **A**（立即見效、低風險）＋同步做 **B**（治本、留在 Supabase 生態）；若日後知識量與多模態需求大增，再評估 **C**。C 的最大阻礙通常不是技術，而是維運與資料合規。

## 7. 驗證方式（唔靠感覺）

- 用現有 `npm run test:customer-service-regression` 建對照案例，新增「同義詞／口語／追問」案例，量度命中率與 fallback 率。
- 用 `customer-service-model-evaluate`（`supabase/functions/customer-service-model-evaluate`）跑候選 config 對比。
- 線上 AI 預覽驗收（回歸測試不呼叫真模型，見 `docs/CUSTOMER_SERVICE_REGRESSION.md:63`）。
- 指標：FAQ 命中率、`faq_not_found` 比率、人工 handoff 率、回覆採用率（`usedModel`）、客人追問率。

## 8. 相關檔案

- 檢索 RPC 與評分：`supabase/migrations/20260914162000_customer_service_faq_match_scoring.sql`
- FAQ 表結構：`supabase/migrations/20260904120000_whatsapp_customer_service_faq.sql:28`
- 作答器：`supabase/functions/_shared/customer-service-ai.ts:320`
- 檢索／回覆流程：`supabase/functions/_shared/customer-service-bot.ts:1528`
- Deps 接線：`supabase/functions/wati-customer-service/index.ts:1791,2050`
- 對話上下文：`supabase/functions/_shared/customer-service-context.ts`
- 回歸測試說明：`docs/CUSTOMER_SERVICE_REGRESSION.md`
