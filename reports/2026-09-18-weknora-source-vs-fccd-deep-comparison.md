# WeKnora 源碼剖析 × FCCD 智能客服深度對比

日期：2026-09-18
WeKnora 版本：commit `92e7c0a`（存放於 `D:\work\WeKnora`）
FCCD 範圍：`supabase/functions/wati-customer-service` 及 `supabase/functions/_shared/customer-service-*.ts`
性質：源碼級分析，未改動任何程式碼

> 修正前一版（`2026-09-18-weknora-vs-fccd-customer-service-ai-gap-analysis.md`）只依官方文件的描述；本版所有 WeKnora 結論均附 `路徑:行號`。

---

## 0. 先講結論（源碼證實）

| # | 差距 | WeKnora 源碼證據 | FCCD 源碼證據 |
|---|---|---|---|
| 1 | **無語義檢索** | 向量 + BM25 混合檢索，RRF 融合（k=60，權重 0.7/0.3）`knowledgebase_search.go:193`、`knowledgebase_search_fusion.go:129` | 只 `pg_trgm` + `ILIKE`，門檻 0.50 `20260914162000_...sql:6-99` |
| 2 | **無 rerank** | Rerank plugin，composite=0.6×model+0.3×base+0.1×source，MMR λ=0.7 `chat_pipeline/rerank.go:223,439-455` | 完全無 |
| 3 | **無查詢改寫/擴展** | LLM 改寫（指代消解 + 意圖 + JSON）`config/prompt_templates/rewrite.yaml`；本地查詢擴展 `chat_pipeline/query_expansion.go:16` | 直接用客人原句 `bot.ts:1534` → `index.ts:1791` |
| 4 | **知識粒度單薄** | 512/80 分塊、父子 4096/384、context header、生成問題、摘要、OCR/VLM chunk `chunker/splitter.go:102-114`、`strategy.go:220-243` | 單條 FAQ（question/answer/keywords）`20260904120000_...sql:28` |
| 5 | **FAQ 無相似/反例** | `FAQChunkMetadata{StandardQuestion, SimilarQuestions, NegativeQuestions, Answers}` `types/faq.go:16-25` | 無 |
| 6 | **作答器無對話上下文** | 多輪歷史進 messages + 檢索前改寫 `chat_pipeline/load_history.go`、`query_understand.go` | `answerFaqWithModel(query, candidates)` `index.ts:2050`，無 recentMessages |
| 7 | **生成過度保守** | 「不足就講缺咩 + 下一步」，容許推理/計算/翻譯 `system_prompt.yaml:21-27` | 「不足即 null」+ 數字硬性 grounded `customer-service-ai.ts:320,373,127` |
| 8 | **引用/來源** | `cN/wN` 標記 + 生成後展開，串流安全 `modelcontext/citations.go:170-202` | sourceIds 嚴格全對應，否則拒答 `customer-service-ai.ts:314` |

FCCD 反而優於 WeKnora 的一點：**多問題拆分**。WeKnora RAG 路徑無子問題分解（`rewrite.yaml` 只出一個 `rewrite_query`），FCCD 有 `splitCustomerServiceFaqQuestions`（`bot.ts:827`）。

---

## 1. WeKnora 全鏈路源碼剖析

### 1.1 檢索：HybridSearch + RRF + Rerank

**入口與階段**（`internal/application/service/knowledgebase_search.go:125`）：
1. `MatchCount` 正規化，預設 50（`:317`）
2. 解析 KB IDs、授權、檢查同一 embedding model（`:134-185`）
3. **過度檢索**：`matchCount = max(params.MatchCount*5, DefaultRetrievalTopK) * len(KB)`，上限 500（`:193-196`）
4. 查詢向量只算一次（`:206-214`）
5. 依 `(VectorStoreID, TenantID)` 分組並行檢索（`knowledgebase_search_fanout.go:48-87`，並發 4、每組 30s）
6. 向量/關鍵字結果分類（`knowledgebase_search_fusion.go:13`）
7. **RRF 融合/去重**（`fusion.go:33`）
8. FAQ 後處理（負例過濾 + 迭代檢索，`knowledgebase_search_faq.go:24`）
9. 截斷至 `MatchCount`，補全 chunk 資料（`knowledgebase_search_results.go:14`）

**RRF 公式**（`knowledgebase_search_fusion.go:129,164-169`）：
```
rrfScore += vectorWeight / (rrfK + vectorRank)   // 0.7 / (60 + rank)
rrfScore += keywordWeight / (rrfK + keywordRank) // 0.3 / (60 + rank)
```
- 兩個檢索器都各自 TopK = 過度檢索量（`:433,462`）
- 只有向量或只有關鍵字時不走 RRF，直接沿用原分數（`fusion.go:34-48`）
- Postgres 向量查詢再放大：`expandedTopK = TopK*2`，下限 100 上限 200，設 `hnsw.ef_search`、`hnsw.iterative_scan=strict_order`（`postgres/repository.go:350-431`）

**Rerank**（不在 HybridSearch，屬 chat pipeline plugin，`chat_pipeline/rerank.go`）：
- 由 `enable_rerank: true`（`config.yaml:21`）與 `RerankModelID != ""` 控制；模型缺席時跳過（`:57-62`）
- 輸入 = 檢索候選（chat 路徑以 `EmbeddingTopK`，預設 30/50 檢索），輸出經 **MMR** 保留 `RerankTopK`（λ=0.7，`:223`）
- **複合分數**：`0.6*modelScore + 0.3*baseScore + 0.1*sourceWeight`，clamp [0,1]（`:439-455`）
- 門檻預設 `RerankThreshold` 0.3（config.yaml）或 0.2（struct）；空結果時門檻降級 ×0.7、下限 0.3（`:148-161`）；Top-1 score ≥0.15 仍保留（`:394-408`）
- **Rerank 失敗會 fallback 用原始檢索結果**（`:130-144`），不會令整條回答失敗

**檢索預設值對照**（struct `retrieval_config.go:14-38` vs `config/config.yaml:9-21`；實際 runtime 以 config.yaml 覆蓋）：

| 參數 | struct 預設 | config.yaml 實際 |
|---|---|---|
| EmbeddingTopK / 檢索 TopK | 50 | 30 |
| VectorThreshold | 0.15 | 0.2 |
| KeywordThreshold | 0.3 | 0.3 |
| RerankTopK | 10 | 30 |
| RerankThreshold | 0.2 | 0.3 |
| max_rounds | — | 5 |
| RRF K / weights | 60 / 0.7:0.3 | （未覆蓋） |
| enable_rewrite / expansion / rerank | — | 全部 true |

> `builtin-quick-answer` 這個 RAG 預設 agent 反而收緊：`embedding_top_k:10, vector_threshold:0.5, rerank_top_k:10, faq_priority_enabled:true, faq_direct_answer_threshold:0.9, faq_score_boost:1.2`（`builtin_agents.yaml:37-44`）。

### 1.2 分塊與索引

**字元分塊預設**（`internal/infrastructure/chunker/splitter.go:102-114`）：
- `DefaultChunkSize = 512`、`DefaultChunkOverlap = 80`、分隔符 `["\n\n", "\n", "。"]`
- 策略：`auto/heading/heuristic/recursive`（`strategy.go:18-24`）；`auto` 先 profile 文件再選（`profiler.go:216-241`）
- 中文 token 換算：`zh 1.7 chars/token`，安全係數 0.9（`tokens.go:24-29,158`）
- 表頭追蹤：新 chunk 自動帶入所屬表頭（`headerTracker`，`splitter.go:391-517`）
- 保護 Markdown 數學/圖片/連結/表格/代碼，硬上限 7500 runes（`:307,400`）

**父子分塊**（`strategy.go:220-243`、`knowledge_process.go:425-519`）：
- parent 4096 / child 384，child overlap = 384/5
- parent 存 DB 但**不向量化**；child 帶 `ParentChunkID`；命中 child 時補回 parent（`knowledgebase_search_results.go:129-173`）

**索引內容**（`knowledge_index_content.go:12-21`、`docparser.go:98-104`）：
```
index content = title + "\n" + (contextHeader + "\n\n" + content)
```
即分塊時已把 Markdown 標題麵包屑寫入 embedding 內容。

**每個知識入庫會額外產生**：
- 摘要 chunk（`knowledge_process.go:1438-1495`，輸入上限 8192 字、輸出 1024 tokens）
- AI 生成問題（每 chunk 預設 3 條，逐條獨立索引，`knowledge_process.go:2199-2223`）
- OCR / 圖片描述子 chunk（`image_multimodal.go:303-335`）
- 數據表摘要與欄位描述 chunk（`extract.go:696-782`）
- 知識圖譜（Neo4j，`extract.go:342-378`）
- Wiki 頁（`wiki_pages` + 全文 GIN 索引，`migrations/versioned/000037...:73-74`）

**Embedding 抽象**（`internal/models/embedding/embedder.go:16-37`）：OpenAI 兼容 / Aliyun / Volcengine / Jina / Azure / Gemini / Zhipu 等；批次 `BATCH_EMBED_SIZE=5`，入庫 batch 40、併發 5，硬截斷 20000 runes，provider truncate 預設 511 tokens（`keywords_vector_hybrid_indexer.go:25,105-110`、`openai.go:61-63`）。

### 1.3 RAG 問答管線（`session_knowledge_qa.go:163-207`）

```
LOAD_HISTORY → MEMORY_RECALL → QUERY_UNDERSTAND → CHUNK_SEARCH_PARALLEL →
CHUNK_RERANK → [WEB_FETCH] → CHUNK_MERGE → FILTER_TOP_K →
[DATA_ANALYSIS] → INTO_CHAT_MESSAGE → CHAT_COMPLETION_STREAM
```

**Query 理解**（`chat_pipeline/query_understand.go`）：
- 觸發：`enable_rewrite` 或有圖片（`:67-74`）
- 用 LLM 一次過做：**指代消解**（它/this→明確主語）、補全省略、意圖分類（9 類）、圖片描述
- 溫度 0.3、max tokens 150（有圖 500）、輸出嚴格 JSON `{rewrite_query, intent, image_description}`（`:113-128`）
- 意圖分類規則：「不確定時一律選 `kb_search`」（`rewrite.yaml:54`）
- 失敗時**靜默沿用原問題**（`:129-135`）
- 另有**本地查詢擴展**（非 LLM）：停用詞去除、引號短語、分隔符切分、中文疑問詞去除，最多 5 個變體（`query_expansion.go:114-188`）

**多輪上下文**（`load_history.go:32-72`、`common.go:127-183`）：
- 取最近 `max_rounds`（5）組 Q&A，去掉 `<think>`，逐對重建
- 歷史同時進 (a) 改寫 prompt 的 `{{conversation}}`，(b) 最終 messages 的 user/assistant 對，(c) 作為檢索證據 `injectHistoryResults`（`merge.go:130-145`，標 `MatchTypeHistory`）
- **RAG 路徑沒有上下文壓縮/token 預算**；`ContextConfig` sliding_window/smart 只被 tenant DTO 引用，未接上管線（`types/session.go:51-73`）

**上下文拼裝與引用**（`into_chat_message.go`、`modelcontext/citations.go`）：
```
## Reference materials (source data)
<documents>…每 KB 標題/描述/元資料…</documents>
<context id="1">passage</context> …
## Request metadata
Current time: … ## User request: {{query}}
```
- FAQ 優先模式：`<source type="faq" priority="high">`，首條命中用 `match="exact"`（`into_chat_message.go:125-154`）
- 引用協定：模型只准寫 `<ref id="cN"/>`/`<ref id="wN"/>`，系統生成後展開成 `<kb …/>`/`<web …/>`；未知 handle 靜默丟棄；串流有緩衝避免半截 tag（`citations.go:170-302`）
- 未檢索到時：`fallback_strategy: "model"`（config.yaml:16），會用知識庫文件清單 + fallback prompt 生成有用回覆，而非罐頭字（`session_knowledge_qa.go:930-1150`）

**System prompt**（`system_prompt.yaml:21-27`）關鍵：
> "You may reason, calculate, summarize, or translate those materials, but do not invent missing source facts. … If the materials do not answer the question, say what is missing and give a useful next step. Do not claim that the absence of a retrieval result proves something does not exist."

對比 FCCD 的 "return answer null"（`customer-service-ai.ts:373`）—— WeKnora 傾向**仍給有用回覆**。

### 1.4 FAQ 子系統

**資料模型**（`internal/types/faq.go:16-25`）：
```go
type FAQChunkMetadata struct {
    StandardQuestion  string
    SimilarQuestions  []string
    NegativeQuestions []string
    Answers           []string
    AnswerStrategy    AnswerStrategy // all | random
    ...
}
```
- FAQ 不是獨立表，是 `Chunk` 行（`ChunkType="faq"`），metadata 存上述欄位（`knowledge_faq.go:184-228`）
- 兩種索引模式（`knowledgebase.go:38-56`）：`question_only` vs `question_answer`；`combined`（標準+相似同一向量）vs `separate`（逐條向量）
- 索引內容 = 標準問 + 相似問（+答案，視模式）；**負例永不索引**（`knowledge_faq.go:1642-1643,1890-1904`）
- `NormalizeQuestion`：去 URL、小寫、去邊界標點、繁轉簡、全形轉半形（`faq.go:583-608`）

**FAQ 檢索**（`knowledgebase_search_faq.go`、`knowledge_faq.go:922-1253`）：
- **純語義檢索**：FAQ KB 在檢索時停用關鍵字（`knowledgebase_search.go:410-415`）
- `VectorThreshold` 預設 **0.7**（一般檢索 0.15/0.2），`MatchCount` 10、上限 50（`knowledge_faq.go:931-940`）
- **負例過濾**：只做「大小寫/空白不敏感的字串完全相等」硬過濾，非向量降權（`knowledgebase_search_faq.go:300-316`）
- **迭代檢索**：命中不足時 TopK 由 matchCount×3 起每輪倍增，最多 5 輪、上限 500（`:78-210`）
- FAQ 優先：命中分 ≥ `faq_direct_answer_threshold`（內建 agent 設 0.9）時標 `match="exact"` 並靠前；rerank 再 `×faq_score_boost`（1.2）上限 1.0（`builtin_agents.yaml:37-39`、`rerank.go:205-218`）

**已知實作缺口**（源碼如此，不是我的推測）：`AnswerStrategy=random` 只寫不讀；無「從文件自動抽取 FAQ」功能。

### 1.5 Agent / ReAct（補充維度）

- 預設 RAG 問答走 `knowledge-chat` 的 **quick-answer**；`smart-reasoning` 才入 ReAct 引擎（`qa.go:921-963`）
- ReAct 迴圈 think→analyze→act→observe（`agent/engine.go:588-884`），迭代上限 20（常數）、內建 agent 30/50、服務層未設則 5、硬上限 100
- 工具：`search_knowledge(mode=hybrid|semantic|keyword)`、`read_document`、`list_documents`、`query_knowledge_graph`、`wiki_search`、`web_search`、MCP 等（`agent/tools/definitions.go:8-76`）
- Grounding 規則：目錄標題/摘要只算導航提示，不算證據；不得聲稱未執行的搜尋（`grounding_prompt.go:16-82`）
- 長期記憶：預設**關閉**（`memory.go:334-336`），開啟後以 `<user_memory>` 注入 system prompt，並可影響檢索（`memory_affinity.go`）

---

## 2. FCCD 現況（源碼對照）

| 環節 | 實作 | 檔案:行 |
|---|---|---|
| 意圖分類 | Regex 硬規則 + LLM（有 recentMessages） | `customer-service-ai.ts:200`、`:272` |
| FAQ 檢索 RPC | trigram + ILIKE + keyword 命中計分，門檻 0.50 | `supabase/migrations/20260914162000_customer_service_faq_match_scoring.sql:6-99` |
| 檢索接線 | `searchFaqs` 只傳 p_query / p_limit | `wati-customer-service/index.ts:1791` |
| 命中過濾 | `strongPublishedFaqMatch` 字串規則 | `_shared/customer-service-bot.ts:795` |
| FAQ 作答 | 只准用命中 FAQ、不足回 null、來源 id 全對應、數字 grounded | `_shared/customer-service-ai.ts:320,314,127,373` |
| 作答上下文 | **無 recentMessages** | `wati-customer-service/index.ts:2050` |
| 多問題拆分 | 有（自研） | `_shared/customer-service-bot.ts:827` |
| 無 FAQ fallback | 有 recentMessages | `customer-service-ai.ts:437` |
| 對話狀態機 | order lookup / 建單 / handoff / suspended goals | `customer-service-bot.ts:1668+` |
| FAQ 資料 | question / answer / keywords / locale / is_published | `20260904120000_whatsapp_customer_service_faq.sql:28` |
| 可調參數 | model / system_prompt / temperature / retrieval_limit(預設3) | `customer_service_config_versions`（`20260904172000_...:15-31`） |

---

## 3. 逐項深對比

### 3.1 召回：FCCD 為何輸

**中文無分詞 + 無語義向量**。`search_published_customer_faqs` 對 query 及 FAQ 做 `regexp_replace` 去空白標點後做 `similarity()`（trigram）。問題：
- 「點樣退錢」vs「退款流程」trigram 重疊低
- 「聽日送唔送」vs「星期日送貨」語義近但字面遠
- 單一 keyword 命中只得 0.25 分，門檻 0.50 直接濾走

WeKnora 用 embedding 語義召回解決同義/口語，再用 BM25 補精確字（訂單號、專名），RRF 合併。這正是「答得好」的第一因。

### 3.2 精排：Rerank 有無

即使 FCCD 命中多條，也只是按 trigram 分數排序，沒有 query-passage 交叉編碼。WeKnora 的 rerank 用 query+document 一起評分（`rerank.go:439-455`），並有門檻降級與 fallback，召回偏差可在精排修正。

### 3.3 知識形態：單條 FAQ vs 分塊知識

FCCD 一問一答，客人一改寫就冇料。WeKnora 同一文件切成多個 chunk、帶父子結構與 context header，命中任一 chunk 可補回父 chunk；再加上生成問題與摘要，等於一條知識有多個入口。

### 3.4 生成約束：保守 vs 輔助

FCCD 的「不足即 null」設計為了安全，但代價是大量 fallback。WeKnora 系統提示明確要求「講清楚缺咩 + 給下一步」，甚至允許「對材料做推理/計算/翻譯」。兩者都反幻覺，但 WeKnora 把「無答案」變成「有幫助」；FCCD 把「無答案」變成「轉人工」。

### 3.5 對話上下文：關鍵實作缺口

FCCD 分類器有 `recentMessages`，但 FAQ 作答器沒有。源碼：
```ts
// wati-customer-service/index.ts:2050
async answerFaqWithModel(query, candidates) {
  const result = await answerCustomerServiceFaqWithTieredAi({ question: query, faqs: ..., tiers });
}
```
`answerCustomerServiceFaqWithAi` 的 user payload 也只有 `{question, publishedFaqs}`（`customer-service-ai.ts:383-394`）。結果：客人追問「咁幾錢？」時，作答器看不到上一輪。
WeKnora 把歷史同時餵給改寫 prompt、最終 messages 與檢索證據。

### 3.6 引用機制

FCCD 要求模型回 `sourceIds` 且必須與候選**完全一致**，否則整個答案作廢（`customer-service-ai.ts:314`）。這令即使答案正確但漏標 id 都會 fallback。WeKnora 用 `cN` handle + 生成後展開，未知 handle 靜默移除，不會因引用格式問題廢掉答案。

### 3.7 FCCD 的相對優勢（不應盲目照抄）

- **多問題拆分**：WeKnora RAG 無此能力，FCCD `splitCustomerServiceFaqQuestions` 是加分項。
- **業務動作確定性**：建單、訂單查詢、handoff 是 FCCD 有而 WeKnora 沒有的，必須保留。
- **嚴格數字 grounded**：金融/數量場景有價值，宜保留但改「只檢查數字」而非「全答案作廢」。

---

## 4. 為什麼 WeKnora 答得好：源碼級根因排序

1. **語義召回**（embedding + BM25 + RRF）→ 命中率。
2. **Rerank + MMR** → 上下文純度，減少誤導。
3. **查詢改寫**（指代消解）→ 短問、追問、口語。
4. **分塊 + 多入口索引** → 每條知識的可用素材量。
5. **生成提示導向「有幫助」而非「拒答」**。
6. **上下文完整接入**（改寫 / messages / 檢索證據三處）。
7. **引用容錯**（生成後展開、未知 handle 丟棄）。

---

## 5. 把 WeKnora 機制映射到 FCCD（可落地清單）

| WeKnora 機制 | FCCD 最小可行改動 | 成本 | 效果 |
|---|---|---|---|
| 對話上下文 | `answerFaqWithModel` 增傳 `recentMessages`，payload 注入 | 0.5 日 | 高 |
| 語義檢索 | `pgvector` + `customer_faq_embeddings`；檢索改向量 + trigram + RRF | 1-2 週 | 最高 |
| Rerank | 用 LLM 做 cross-encoder 式重排（Top-N → Top-k 入 prompt） | 3-5 日 | 高 |
| 相似問/反例 | 新表 `customer_faq_aliases`（type=similar/negative），檢索後負例過濾 | 3-5 日 | 中高 |
| 查詢改寫 | 檢索前用小模型把口語問題改寫成標準問 | 2-3 日 | 高 |
| 引用容錯 | 放寬 `sourceIds` 必須全對應 → 至少一個有效；數字仍 grounded | 0.5 日 | 中 |
| 生成導向 | prompt 由「不足回 null」改「講缺咩 + 下一步」 | 0.5 日 | 中高 |
| 父子/多入口 | FAQ 可加「相似問」入口；長答案拆段落入索引 | 1 週 | 中 |

> 全部可留在 Supabase / Edge Functions 生態，沿用既有回歸測試（`npm run test:customer-service-regression`）與 `customer-service-model-evaluate`。

---

## 6. 風險與注意

- WeKnora 的 FAQ **負例是精確字串比對**，不是語義降權（`knowledgebase_search_faq.go:300-316`）；若照抄，效果有限，FCCD 應直接做語義負例。
- WeKnora RAG 路徑**沒有上下文壓縮/token 預算**；照抄時要注意 FCCD 的 WhatsApp 短訊場景，歷史不用太長。
- WeKnora `random` 答案策略只寫不讀；不要當成可用功能。
- WeKnora 有大量基建（Asynq、Neo4j、多向量庫、docreader Python），直接引入 FCCD 屬過重；只建議抽 **檢索/改寫/rerank/上下文** 四個機制。
- 若採「接入 WeKnora 服務」方案，需先確認：資料合規（客人對話外送）、延遲（額外 HTTP + rerank）、故障隔離、以及誰維運。

---

## 7. 附：關鍵常數速查（WeKnora 源碼）

| 項目 | 值 | 位置 |
|---|---|---|
| Chunk size / overlap | 512 / 80 | `chunker/splitter.go:103-104` |
| Parent / child | 4096 / 384 | `chunker/strategy.go:222-225` |
| EmbeddingTopK | 30 (config) / 50 (struct) | `config.yaml:12`、`retrieval_config.go:44` |
| VectorThreshold | 0.2 / 0.15 | `config.yaml:13`、`retrieval_config.go:55-60` |
| KeywordThreshold | 0.3 | `retrieval_config.go:63-68` |
| RerankTopK | 30 / 10 | `config.yaml:15`、`retrieval_config.go:71-76` |
| RerankThreshold | 0.3 / 0.2 | `config.yaml:14`、`retrieval_config.go:79-84` |
| RRF K / weights | 60 / 0.7:0.3 | `retrieval_config.go:87-109` |
| max_rounds | 5 | `config.yaml:10` |
| FAQ VectorThreshold / MatchCount | 0.7 / 10 | `knowledge_faq.go:931-940` |
| FAQ direct-answer threshold / boost | 0.9 / 1.2 | `builtin_agents.yaml:37-39` |
| ReAct max iterations | 20 常數；內建 30/50；服務預設 5，上限 100 | `agent/const.go:19`、`agent_service.go:1180-1186` |
