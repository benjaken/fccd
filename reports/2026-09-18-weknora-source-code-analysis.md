# WeKnora 源碼分析報告

- 專案：Tencent/WeKnora（開源 LLM 知識庫問答框架，MIT）
- 版本：`VERSION = 0.8.0`
- 分析對象 commit：`92e7c0ab37bb553df950b91680f162127c8d1282`（main，2026-09-18）
- 源碼路徑：`D:\work\WeKnora`
- 語言/技術：Go 1.26 後端、Vue 3 前端、Python docreader（gRPC）
- 報告性質：只讀源碼分析，未執行、未改動

---

## 1. 摘要

WeKnora 是一條完整「解析 → 分塊 → 索引 → 檢索 → 重排 → 生成 → 引用」的企業級 RAG 管線，另附 ReAct Agent、FAQ、Wiki、知識圖譜與長期記憶。其問答質素的核心來自四個機制：

1. **混合檢索**：向量 + BM25，RRF 融合（k=60，權重 0.7/0.3）。
2. **Rerank + MMR**：query-passage 交叉評分後再挑多樣性結果。
3. **查詢改寫**：LLM 做指代消解並輸出單一改寫問題；另有本地查詢擴展。
4. **多入口索引**：分塊 + 父子 + context header + 生成問題 + 摘要 + OCR/圖片 chunk。

同時，源碼亦揭示若干限制：RAG 路徑**無上下文壓縮/ token 預算**、**無子問題分解**、FAQ **負例只做精確字串過濾**、`AnswerStrategy=random` **只寫不讀**、`keywords_extraction.yaml` **未被 chat 使用**。

---

## 2. 模組地圖

頂層（`D:\work\WeKnora`）：

| 目錄 | 職責 |
|---|---|
| `cmd/` | 程式入口（後端 server、CLI 等） |
| `internal/` | Go 後端全部業務邏輯（見下） |
| `docreader/` | Python 文件解析 gRPC 服務 |
| `frontend/` | Vue 3 控制台（Nginx 反代 `/api`） |
| `mcp-server/` | 把 WeKnora 暴露為 MCP Server |
| `cli/` | 命令列客戶端 |
| `miniprogram/` | 微信小程序 |
| `migrations/` | 資料庫遷移 |
| `config/` | `config.yaml`、`builtin_agents.yaml`、`prompt_templates/*.yaml` |
| `helm/`、`docker/`、`deploy/` | 部署 |
| `dataset/`、`testdata/`、`tests/` | 測試資料 |
| `website-docs/`、`docs/` | 文件 |

`internal/` 主要套件：

| 套件 | 職責 |
|---|---|
| `application/service` | 業務服務層（KB、知識、FAQ、Chat pipeline、Agent、Session…） |
| `application/service/chat_pipeline` | RAG 問答各階段 plugin（search / rerank / merge / prompt…） |
| `application/repository/retriever` | 各向量/全文檢索引擎 driver |
| `infrastructure/chunker` | 分塊器 |
| `infrastructure/docparser` | 文件解析引擎路由 |
| `models/{chat,embedding,rerank,vlm,asr}` | 模型抽象層 |
| `agent` | ReAct Agent 引擎與工具 |
| `types` | 領域型別與常數 |
| `modelcontext` | 引用/source handle 協定 |
| `container` | 依賴注入與啟動組裝 |

部署預設（`docker-compose.yml`、官方架構文件）：app 8080、frontend 80、docreader 50051（容器內）、postgres(ParadeDB) 5432、redis 6379；可選 qdrant/milvus/weaviate/doris/neo4j/minio/searxng/langfuse/mcp。`RETRIEVE_DRIVER` 預設 `postgres`。

---

## 3. 文件入庫與分塊

### 3.1 入口與非同步任務
- 建立知識即入隊 Asynq `document:process`（`internal/application/service/knowledge_create.go:252-256`），`MaxRetry(3)`。
- Worker `ProcessDocument`（`knowledge_process.go:3340`）階段：狀態守衛 → `processing` → DocReader 解析 → ASR → 圖片處理 → Go 分塊 → `processChunks`（寫 DB + BatchIndex + fan-out）。
- 五個標準階段：`docreader, chunking, embedding, multimodal, postprocess`（`types/knowledge_span.go:42-48`）。
- 狀態機：`pending → processing → finalizing → completed`，另有 `failed/deleting/cancelled`（`types/knowledge.go:42-71`）；`finalizing` 用 pending subtask 計數遞減至 0 才 completed（`repository/knowledge.go:634-733`）。

### 3.2 解析引擎
- Python `docreader` 只負責「檔案 → Markdown + 圖片引用」，**不做 OCR/VLM/分塊/入庫**（`docreader/parser/base_parser.py:13-19`；分塊已在 Go）。
- 引擎選擇：`ParserEngineRule{FileTypes, Engine}`，first-match（`types/knowledgebase.go:244-251,329-353`）。
- 引擎清單：`builtin, simple, anydoc, weknoracloud, mineru, mineru_cloud, paddleocr_vl, paddleocr_vl_cloud`（`infrastructure/docparser/engines.go:13-30`）。
- PDF 逐頁分類 scanned/text（影像面積比 0.5、最少 10 字；`docreader/parser/pdf_parser.py:74-78`），scanned 頁在 Go 側交 VLM OCR（`image_multimodal.go:260-276`）。
- 表格抽取、MinerU/OpenDataLoader/Docling hybrid、ASR（`models/asr/asr.go`）各有專屬路徑。

### 3.3 分塊（`internal/infrastructure/chunker`）
- 預設 `ChunkSize=512`、`ChunkOverlap=80`、分隔符 `["\n\n","\n","。"]`（`splitter.go:102-114`）。
- 策略 `auto/heading/heuristic/recursive`（`strategy.go:18-24`）；`auto` 先 profile 再揀（`profiler.go:216-241`）。
- 中文 token 換算 1.7 chars/token、安全係數 0.9（`tokens.go:24-29,158`）。
- 保護 Markdown 數學/圖片/連結/表格/代碼，硬上限 7500 runes（`splitter.go:307,400`）。
- 表頭追蹤令新 chunk 自動帶表頭（`splitter.go:391-517`）。
- **父子分塊**：parent 4096 / child 384，child overlap = 384/5（`strategy.go:220-243`）；parent 不向量化、child 帶 `ParentChunkID`（`knowledge_process.go:425-519`）。
- **Context header**：分塊時寫入 Markdown 標題麵包屑，索引內容 = `title + "\n" + (contextHeader + "\n\n" + content)`（`docparser.go:98-104`、`knowledge_index_content.go:12-21`）。

### 3.4 每個知識額外產生的索引
- 摘要 chunk（輸入上限 8192 字、輸出 1024 tokens；`knowledge_process.go:1438-1495`）。
- AI 生成問題：每 chunk 預設 3 條（上限 10），逐條獨立索引（`knowledge_process.go:2199-2223`、`knowledge_post_process.go:631-637`）。
- OCR / 圖片描述子 chunk（`image_multimodal.go:303-335`）。
- 數據表摘要 + 欄位描述 chunk（`extract.go:696-782`）。
- 知識圖譜（Neo4j，`extract.go:342-378`）。
- Wiki 頁（`wiki_pages` 表 + 全文 GIN 索引，`migrations/versioned/000037...:73-74`）。

### 3.5 Embedding 與批次
- 介面 `Embedder`（`models/embedding/embedder.go:16-37`），多 provider（OpenAI 兼容 / Aliyun / Volcengine / Jina / Azure / Gemini / Zhipu / WeKnoraCloud）。
- 入庫 batch 40、併發 5（`keywords_vector_hybrid_indexer.go:105-110`），重試 5 次指數退避。
- 硬截斷 20000 runes；provider `truncate_prompt_tokens` 預設 511（`openai.go:61-63`）。

---

## 4. 檢索引擎

### 4.1 入口與階段（`application/service/knowledgebase_search.go:125`）
1. 正規化 `MatchCount`（預設 50，`:317`）
2. 載入/授權 KB、檢查同一 embedding model、揀 primary KB（`:153-185`）
3. 過度檢索：`matchCount = max(MatchCount*5, DefaultRetrievalTopK) * #KB`，上限 500（`:193-196`）
4. 查詢向量只算一次（`:206-214`）
5. 依 `(VectorStoreID, TenantID)` 分組並行（並發 4、每組 30s；`knowledgebase_search_fanout.go:23-87`）
6. 分類向量/關鍵字結果（`knowledgebase_search_fusion.go:13`）
7. RRF 融合/去重（`fusion.go:33`）
8. FAQ 後處理（`knowledgebase_search_faq.go:24`）
9. 截斷並補全 chunk（`knowledgebase_search_results.go:14`）

### 4.2 RRF
- 公式（`knowledgebase_search_fusion.go:129,164-169`）：`Σ weight/(k+rank)`，rank 由 1 起。
- 預設 `k=60`、向量 0.7 / 關鍵字 0.3（`types/retrieval_config.go:87-109`）。
- 只有單邊結果時不走 RRF（`fusion.go:34-48`）。
- Postgres 向量查詢放大 `TopK*2`（下限 100、上限 200），設 `hnsw.ef_search` 與 `hnsw.iterative_scan=strict_order`（`postgres/repository.go:350-431`）。

### 4.3 結果補全
- 命中 child 補 parent（`MatchTypeParentChunk`）、相鄰 chunk（`MatchTypeNearByChunk`）、關聯 chunk（`MatchTypeRelationChunk`）；圖片 chunk 有第二層 parent（`knowledgebase_search_results.go:129-193`）。
- 後過濾剔除停用/處理中/失敗 chunk（`:362-378`）。

### 4.4 Rerank（屬 chat pipeline，非 HybridSearch）
- 檔案：`application/service/chat_pipeline/rerank.go`。
- 觸發：`enable_rerank: true` 且 `RerankModelID != ""`；否則跳過（`:57-62`）。
- 輸出：**MMR** λ=0.7 保留 `RerankTopK`（`:223`）。
- 複合分數：`0.6*model + 0.3*base + 0.1*sourceWeight`，clamp [0,1]（`:439-455`）。
- 門檻：預設 0.3（config）/0.2（struct）；0 結果時 ×0.7、下限 0.3（`:148-161`）；Top-1 ≥0.15 保留（`:394-408`）。
- 模型/API 失敗 → **回落原始檢索結果**（`:130-144`）。
- FAQ boost：`×faq_score_boost` 上限 1.0（`:205-218`）。

### 4.5 引擎 driver
- `types/retriever.go:7-27`：`postgres, elasticsearch, infinity, elasticfaiss, qdrant, milvus, weaviate, doris, sqlite, tencent_vectordb, opensearch`。
- 由 `RETRIEVE_DRIVER`（逗號分隔）啟動時註冊（`container/container.go:1221`）。
- driver → retriever type 映射：`types/tenant.go:17-57`。

---

## 5. RAG 問答管線

### 5.1 階段（`application/service/session_knowledge_qa.go:163-207`）
```
LOAD_HISTORY → MEMORY_RECALL → QUERY_UNDERSTAND → CHUNK_SEARCH_PARALLEL →
CHUNK_RERANK → [WEB_FETCH] → CHUNK_MERGE → FILTER_TOP_K →
[DATA_ANALYSIS] → INTO_CHAT_MESSAGE → CHAT_COMPLETION_STREAM
```
- 無 KB/web → 純聊天（`LOAD_HISTORY + MEMORY_RECALL + CHAT_COMPLETION_STREAM`）。
- 任一階段 `ErrSearchNothing` → `handleFallbackResponse`（`:773-806`）。

### 5.2 查詢理解（`chat_pipeline/query_understand.go`）
- 觸發：`enable_rewrite` 或有圖片（`:67-74`）。
- 一次 LLM 完成：指代消解、補全省略、意圖分類（`greeting/summarize/web_search/kb_search/clarification/follow_up/image_only/doc_only/chitchat`）、圖片描述。
- 溫度 0.3、max tokens 150（有圖 500）；嚴格 JSON `{rewrite_query, intent, image_description}`（`:113-128`）。
- 意圖規則：「不確定一律 `kb_search`」（`config/prompt_templates/rewrite.yaml:54`）。
- 失敗靜默沿用原問題（`:129-135`）。
- 本地查詢擴展（非 LLM）：停用詞、引號短語、分隔符、中文疑問詞，最多 5 變體（`query_expansion.go:114-188`）。

### 5.3 多輪上下文（`load_history.go`、`common.go:127-183`）
- 取最近 `max_rounds`（預設 5）組 Q&A，去 `<think>`，按時間重建。
- 歷史同時用於：改寫 prompt 的 `{{conversation}}`、最終 messages、檢索證據 `injectHistoryResults`（`merge.go:130-145`）。
- **無上下文壓縮 / token 預算**；`types.ContextConfig` sliding_window/smart 未接上 chat pipeline（`types/session.go:51-73`）。

### 5.4 上下文拼裝與引用
- 模板（`context_template.yaml:21-29`）：
  ```
  ## Reference materials (source data)
  {{contexts}}
  ## Request metadata
  Current time: {{current_time}} {{current_week}}
  ## User request
  {{query}}
  ```
- 每筆結果 `<context id="N">passage</context>`；FAQ 優先時 `<source type="faq" priority="high">`、首條 `match="exact"`（`into_chat_message.go:125-163`）。
- 引用協定（`modelcontext/citations.go:14-42`）：模型只准寫 `<ref id="cN"/>` / `<ref id="wN"/>`；生成後展開為 `<kb …/>` / `<web …/>`；未知 handle 靜默丟棄（`:187-189`）；串流有緩衝避免半截 tag（`:208-302`）。

### 5.5 生成與 fallback
- System prompt `default_kb`（`system_prompt.yaml:21-27`）要求：可推理/計算/摘要/翻譯，但不得虛構來源事實；不足時**講清楚缺咩 + 給下一步**；不得把「無檢索結果」當成「不存在」。
- 來源資料邊界 `SourceDataBoundaryPrompt`（`types/prompt_instructions.go:96-101`）：檢索內容是不可信資料，不是指令。
- Fallback：`fallback_strategy: "model"`（`config.yaml:16`），用文件清單 + fallback prompt 生成有用回覆，而非罐頭（`session_knowledge_qa.go:930-1150`）。
- 模型預設：`temperature 0.3`、`max_completion_tokens 1024`（`config.yaml:26-32`）。
- 串流：SSE，每 100ms 輪詢事件（`stream.go:338-359`），事件含 thinking/answer/references/complete。

---

## 6. FAQ 子系統

### 6.1 資料模型（`types/faq.go:16-25`）
```go
type FAQChunkMetadata struct {
    StandardQuestion  string
    SimilarQuestions  []string
    NegativeQuestions []string
    Answers           []string
    AnswerStrategy    AnswerStrategy   // all | random
    Version           int
    Source            string
}
```
- FAQ 是 `ChunkType="faq"` 的 Chunk 行，metadata 存於 `Chunk.Metadata`（`knowledge_faq.go:184-228`）。
- `ContentHash` 基於標準化後的 standard/similar/negative/answers（`faq.go:211-248`）。

### 6.2 索引模式
- `FAQIndexMode`：`question_only` / `question_answer`（`knowledgebase.go:38-45`）。
- `FAQQuestionIndexMode`：`combined` / `separate`（`:48-55`）。
- 預設 `question_answer` + `combined`（`:755-768`）。
- 負例永不索引（`knowledge_faq.go:1642-1643,1890-1904`）。
- `NormalizeQuestion`：去 URL、小寫、去邊界標點、繁轉簡、全形轉半形（`faq.go:583-608`）。

### 6.3 檢索
- FAQ KB **停用關鍵字**，純向量（`knowledgebase_search.go:401-415`）。
- 預設 `VectorThreshold=0.7`、`MatchCount=10`（上限 50）（`knowledge_faq.go:931-940`）。
- **負例只做精確字串比對**（大小寫/空白不敏感；`knowledgebase_search_faq.go:300-316`），非向量降權。
- 命中不足時迭代檢索：seed `matchCount*3`、每輪 ×2、最多 5 輪、上限 500（`:78-210`）。
- FAQ 優先：分數 ≥ `faq_direct_answer_threshold`（內建 agent 0.9）→ `match="exact"`；rerank `×faq_score_boost`（1.2）（`builtin_agents.yaml:37-39`、`rerank.go:205-218`）。

### 6.4 匯入/同步
- 支援 JSON/CSV/Excel，`##` 分隔多值；`append`（同標準問合併）或 `replace`（hash 比對）（`knowledge_faq_import.go:1021-1370`）。
- 大批量轉存 object storage，Asynq 非同步（retry 5、timeout 2h）。
- **無「由文件自動抽取 FAQ」**。

---

## 7. Agent / ReAct 引擎

- 正常 RAG 走 `knowledge-chat` 的 **quick-answer**；`smart-reasoning` 才入 ReAct（`handler/session/qa.go:921-963`）。
- ReAct 迴圈 think → analyze → act → observe（`agent/engine.go:588-884`）；迭代上限常數 20、內建 30/50、服務層未設 5、硬上限 100（`agent/const.go:19`、`agent_service.go:1180-1186`）。
- 工具（`agent/tools/definitions.go:8-76`）：`search_knowledge(mode=hybrid|semantic|keyword)`、`read_document`、`list_documents`、`query_knowledge_graph`、`wiki_*`、`web_search`、`data_analysis`、MCP。
- 能力過濾：無 KB scope 移除 KB 工具、無 wiki KB 移除 wiki 工具、無圖譜移除 graph 工具（`agent_service.go:903-1038`）。
- Grounding：目錄/標題/摘要只是導航提示，不算證據；不得聲稱未執行搜尋（`grounding_prompt.go:16-82`）。
- 長期記憶：預設關閉（`types/memory.go:334-336`）；開啟後以 `<user_memory>` 注入，並可影響檢索排序（`memory_affinity.go`）。
- **無專用子問題分解**；多步靠 `thinking`/`todo_write`（預設不啟用）。

---

## 8. 模型抽象與可觀測性

- Chat/Embedding/Rerank/VLM/ASR 五類模型各有 provider 抽象（`internal/models/*`）。
- 可選 Langfuse 全鏈路追蹤；健康檢查；Swagger（debug 模式）。
- 敏感欄位 AES-256 加密（`SYSTEM_AES_KEY`）；多租戶 RBAC。

---

## 9. 關鍵常數速查

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
| chat temperature / max tokens | 0.3 / 1024 | `config.yaml:31-32` |
| FAQ VectorThreshold / MatchCount | 0.7 / 10 | `knowledge_faq.go:931-940` |
| FAQ direct threshold / boost | 0.9 / 1.2 | `builtin_agents.yaml:37-39` |
| Generate questions | 3（上限 10） | `knowledge_post_process.go:631-637` |
| Over-retrieval cap | 500 | `knowledgebase_search.go:20` |
| ReAct max iterations | 20 常數；30/50 內建；服務 5；上限 100 | `agent/const.go:19` |

---

## 10. 源碼層面嘅設計優點

1. **召回/精排解耦**：HybridSearch 只負責召回融合，rerank 是獨立 plugin，可關可換，失敗可降級。
2. **RRF 而非加權分數**：rank-based，跨引擎分數不可比時仍穩定。
3. **多入口索引**：同一知識有 chunk、生成問題、摘要、圖片描述多個檢索入口，抵消單一改寫。
4. **context header 寫入 embedding**：令脫離原文的 chunk 仍帶標題語義。
5. **引用協定與串流安全**：模型只出 handle，系統展開，避免模型亂寫來源。
6. **檢索階段有進度事件**：前端可顯示「檢索到 N 條 / 相關性不足」。
7. **對抗幻覺是「講缺咩」而非「拒答」**。

---

## 11. 已知實作缺口 / 風險（源碼證實）

| 缺口 | 證據 |
|---|---|
| RAG 路徑無上下文壓縮/token 預算 | `types/session.go:51-73` 未被 chat pipeline 讀取 |
| 無子問題分解 | `rewrite.yaml` 只出一個 `rewrite_query`；grep 無 decompose |
| FAQ 負例只做精確字串過濾 | `knowledgebase_search_faq.go:300-316` |
| `AnswerStrategy=random` 只寫不讀 | 寫入驗證存在，讀取路徑全渲染所有答案 |
| `keywords_extraction.yaml` 未被 chat 使用 | 只載入 config 與 tenant API |
| Wiki `wiki_page` chunk 無生產者 | 全樹只有常數、1.3× boost、刪除路徑 |
| struct 預設 vs `config.yaml` 不一致 | 例如 RerankTopK 10 vs 30；需以實際 config 為準 |

---

## 12. 對 FCCD 嘅啟示（詳見另兩份報告）

- `reports/2026-09-18-weknora-vs-fccd-customer-service-ai-gap-analysis.md`（差距與方案）
- `reports/2026-09-18-weknora-source-vs-fccd-deep-comparison.md`（源碼級逐項對比）

可優先移植且低風險嘅四點：**對話上下文接入作答器、檢索前查詢改寫、放寬生成拒答、引用容錯**；治本則係 **pgvector 語義檢索 + 混合 + RRF + rerank**。不建議整體引入 WeKnora 服務（維運、延遲、合規成本）。
