# PRD：Jev 接入 FCCD 智能客服（分類前置層）— v2

| 項目 | 內容 |
|---|---|
| 文件狀態 | Draft v2（待評審） |
| 日期 | 2026-09-22 |
| 版本 | v2（依 v1 評審修訂） |
| 涉及系統 | `wati-customer-service`、`customer-service-ai`、`customer-service-bot`、`customer-service-intents`、`customer-service-model-evaluate` |
| 外部依賴 | TypeSafe System One API（Jev） |

---

## 0. 修訂說明（v1 → v2）

| # | v1 問題 | v2 修正 |
|---|---|---|
| P0-1 | 誤稱「deterministic 規則是安全權威」 | §4 更正現況；新增 FR3 `applyClassificationSafetyGuards()`；M2 改為「高風險路由召回率」，ground truth 用人工 gold |
| P0-2 | 要求 Jev 回傳完整 `CustomerServiceAiClassification` | FR1 改為窄介面 `CustomerServiceJevDecision` + `trace`；由 orchestration 合併，不偽造空欄位 |
| P0-3 | 18 條實測作准入依據 | §9 明訂評估要求（≥200 人工 gold、完整 enabled intents、多輪、對抗案例）；`scripts/jev` 降為探索用途 |
| P1-4 | 誤以為 evaluator 可產出所需指標 | FR7 列明 evaluator 必要改動（provider 選擇、批次、classification-only latency、per-sample raw、high-risk recall） |
| P1-5 | Shadow telemetry 不足 | FR6 定義 `trace` 完整欄位；由既有 turn persistence 集中寫入，模組不自行寫 DB |
| P1-6 | 設定與灰度未閉環 | FR5 涵蓋 list/create RPC、前端型別與表單、env kill-switch 優先序、穩定 hash、preview/replay 行為、生效驗證 |
| P1-7 | 8s timeout + retry 令 fallback 過慢 | FR8 定義總預算、同步路徑不重試、shadow 並行、p95/p99 指標 |
| P1-8 | per-1k 成本算錯 | 已修正 `scripts/jev/recorder.mjs`；§3 統一基準：每 call ≈ $0.0000285、每千次呼叫 ≈ $0.029 |

---

## 1. 背景與問題

現行分類：規則分類器 `classifyCustomerServiceMessage`（`customer-service-intents.ts:544`）＋ `classifyCustomerServiceWithTieredAi`（`customer-service-ai.ts:623`，primary→信心門檻→fallback）。

痛點：每條訊息都要生成式模型吐 JSON（慢、貴、有格式幻覺）；高頻低風險判斷與需推理判斷混在一起。Jev 專做封閉選項 + 校準機率，適合作前置分類層。

> 前車之鑑：`judge_jev` 曾用於 history replay，表與函式已由 `20260921201000_drop_customer_service_history_jev.sql` 刪除。准入門檻是**可量測贏面**。

---

## 2. 目標與非目標

### 目標
- G1：Jev 作為分類前置層，達標者直接定案，降低延遲與成本。
- G2：以 `applyClassificationSafetyGuards()`（FR3）作**統一安全權威**，對所有模型結果（含 Grok）生效。
- G3：全程零客戶行為改變（shadow）；可一鍵回復。
- G4：以既有 `customer-service-model-evaluate` 產出可比較指標。

### 非目標
- N1：Jev 不生成任何客戶可見文字。
- N2：Jev 不授權不可逆操作；破壞性動作由 FR3 硬規則兜底。
- N3：Jev 不做訂單事實查詢。
- N4：不新增獨立評估平台、不重寫 RAG。
- N5：**Jev 分類只影響客服路由**，不構成 WATI 模板自動化或發送批准；既有客服／例外／營運模板的人工邊界全部保留。

---

## 3. 成功指標（量測與驗收門檻）

| 編號 | 指標 | 門檻 | 量測來源 | 備註 |
|---|---|---|---|---|
| M1 | intent 準確度（人工 gold，分層報告） | ≥ 0.95，且無單一 intent < 0.90 | evaluator + 人工複核 | 每 intent 樣本量 ≥ 30 |
| M2 | **高風險路由召回率** | **= 1.00** | 人工 gold | 每高風險類別 ≥ 20 條；零 observed miss 的 95% 信賴上界 ≤ 0.14（即 n≥21 全對）；shadow 期需人工抽樣（見 §10） |
| M3a | Accepted-set intent precision | ≥ 0.99 | evaluator gold | **ROI 門檻** |
| M3b | Accept rate（Jev 直接定案比例） | 下限 ≥ 0.40（ROI）；上限 > 0.80 觸發漂移告警，**不**直接判失敗 | shadow trace | 非單一成功門檻 |
| M4 | Classification-only 延遲 | p50 ≤ 300ms；p95 ≤ 800ms；p99 ≤ 1200ms | shadow trace | **⚠ v3 smoke test 未達標**（p50 343ms、p90 1220ms），需更多樣本重新驗證 |
| M5 | 成本 | 每千次呼叫 ≤ $0.05（基準 ≈ $0.029） | TypeSafe usage | |
| M6 | Jev 失敗 fallback 成功率 | 100% | trace `fallback_ok` | |
| M7 | 端到端新增延遲（同步路徑） | p95 新增 ≤ 150ms | trace | |
| M8 | Kill-switch 生效 | ≤ 60s | 上線演練 | |

**M2 統計能力要求**：200 條總樣本不等於有足夠高風險樣本。需另訂：
- 每種高風險類別（改單／取消／退款）最低樣本數 ≥ 20。
- 零 observed miss 時的 95% 信賴上界（rule of three：n=21 全對 → 上界 3/21 ≈ 0.14）。
- Deterministic guard 規則矩陣 + 生成式對抗測試獨立驗證。
- 生產 shadow 期每小時抽樣 10 條高風險候選人工 review，累積 7 日後計算 M2（非即時）。

> 成本基準：實測單次 4 題判斷總成本 $0.0000285（54 次 = $0.00153993），每千次呼叫 ≈ $0.029。v1 的「$0.08/1000」是「每案例跑 3 次」的數字，已作廢。

---

## 4. 現況事實更正（v1 錯誤）

| v1 說法 | 實際（附證） |
|---|---|
| 規則命中即定案 | ❌ 只有 `prompt_injection` 硬性 bypass（`customer-service-intents.ts:211`，註解 :212–214）；業務語義一律 AI-first，規則只是**可用性 fallback**（`wati-customer-service/index.ts:362, 374–409`） |
| 破壞性操作由規則保守兜底 | ❌ 改單／取消／退款仍交 AI 重判；`ORDER_HANDOFF` 規則結果未設 `requiresHuman`（`customer-service-intents.ts:556`） |
| `requiresHuman` 會轉人工 | ❌ 路由主要看 `intent === "handoff" / "handoff_order"`（`customer-service-bot.ts:2611, 2641`）；`requiresHuman` 只是輔助閘（`bot.ts:2125, 2200`） |
| Jev 可直接回傳完整型別 | ❌ 現有整合會用 AI 的 `confidence`、`requestedDate`、`requestedFields` 覆蓋 fallback（`index.ts:488–499`）；訂單號另經 `explicitCustomerServiceOrderNumber` 校驗（`intents.ts:218`） |

**結論**：v1 的「規則兜底、Jev 回傳完整型別」不成立。v2 改為：窄介面 + orchestration 合併 + 獨立安全閘（FR3）。

---

## 5. 功能需求

### FR1　Jev 窄介面模組（新增）
`supabase/functions/_shared/customer-service-jev.ts`

```ts
export type DialogAction = "new_request" | "continue_current" | "add_information" |
  "select_option" | "confirm" | "deny" | "correct_previous" | "cancel_current" |
  "switch_task" | "resume_previous";

export type CustomerServiceJevDecision = {
  intentKey: string;
  intentConfidence: number;
  dialogAction: DialogAction;
  dialogActionConfidence: number;
  requiresHumanProbability: number;      // raw Noul，不預先二元化
  needsClarificationProbability: number; // raw Noul
  model: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
};

export type CustomerServiceJevTrace = {
  enabled: boolean;
  shadow: boolean;
  outcome: "decided" | "escalated" | "error" | "disabled" | "safety_override";
  attempted: boolean;
  attempts: number;
  fallbackOk: boolean | null;
  errorCode: string | null;
  inputTokens: number;
  costUsd: number;
  classificationLatencyMs: number | null;
  decision: CustomerServiceJevDecision | null;
};

export async function classifyCustomerServiceWithJev(args: {
  message: string;
  conversationState: string;
  pendingRequest?: string;
  recentMessages?: CustomerServiceRecentMessage[];
  intents: CustomerServiceIntentConfig[];   // 封閉選項
  config: CustomerServiceJevConfig;
  fetchImpl?: typeof fetch;
}): Promise<{ decision: CustomerServiceJevDecision | null; trace: CustomerServiceJevTrace }>;
```

**驗收**：永不 throw；失敗回 `decision: null` 並帶 `trace.errorCode`；**不寫任何資料庫**。

### FR2　Orchestration 合併（修改 `customer-service-ai.ts` / `wati-customer-service/index.ts`）
明確分工：

| 欄位 | 來源 |
|---|---|
| `orderNumber`、`requestedDate`、`requestedFields`、`missingFields`、`slots` | **deterministic**（現有抽取器） |
| `intentKey`、`dialogAction` | Jev（達標）或 Grok |
| `requiresHuman`、`needsClarification` | Jev Noul 機率（達標）或 Grok；**再由 FR3 覆寫** |
| `clarificationQuestion`、自由文字 | **Grok**（Jev 不產生） |
| `toolKey` | 由 `ACTION_TO_REQUIRED_TOOL`（`index.ts:247`）推導，不取自模型 |

**Acceptance policy**（按 `actionKey` 風險分類，不硬編 intent 名稱）：

1. **actionKey 風險分類**：
   - **高風險**：`order_handoff`、`human_handoff`（改單／轉人工）
   - **低風險**：`faq_search`、`availability_check`、`order_lookup`、`inquiry_collect`

2. **接受條件**（全部滿足才接受）：
   - 通用：`intentConfidence ≥ jev_accept_threshold`（0.90）、`needsClarificationProbability < 0.50`
   - 低風險 actionKey：`requiresHumanProbability < 0.50`（與低風險一致）
   - 高風險 actionKey：`requiresHumanProbability ≥ 0.50`（與高風險一致）、`intentConfidence ≥ 0.95`

3. **不一致處理**：
   - 低風險 + 高 `requiresHumanProbability`（≥ 0.50）→ **升 Grok**（可能漏轉風險）
   - 高風險 + 低 `requiresHumanProbability`（< 0.50）→ **升 Grok**（不一致，需確認）
   - `needsClarificationProbability ≥ 0.50` → **升 Grok**（需自由文字澄清）

4. `dialogActionConfidence < 0.80` 時升 Grok。

5. 以上條件**只決定是否接受 Jev 結果**；最終路由仍由 FR3 safety guard 覆寫（單向保守）。

### FR3　統一安全閘 `applyClassificationSafetyGuards()`（新增，P0）
`supabase/functions/_shared/customer-service-safety.ts`

- 對**所有**分類結果（規則/Jev/Grok）在路由前執行。
- 以明確破壞性證據強制：`INJECTION` → `prompt_injection`（拒答）；`ORDER_HANDOFF` / `HANDOFF` 規則命中、或訊息含既有訂單變更意圖 → 強制 `intent = handoff_order`（或 `handoff`）且 `requiresHuman = true`。
- 覆寫方向**只單向**：只會把結果推向更保守（轉人工），永不允許模型把破壞性動作降級為一般查詢。
- 回傳 `safety_override` 標記供 telemetry。
- **需以 `npm run test:customer-service-regression` 驗證零回歸**；誤觸率需人工抽樣檢查。

### FR4　分類器設定（新增）
`customerServiceClassifierConfig(): { jev: CustomerServiceJevConfig; grokTiers: CustomerServiceAiTierConfig; rollout: { shadow: boolean; enabled: boolean; bucket: number; salt: string } }`

- **不**把 Jev 欄位硬塞進 `customerServiceAiTiers`。
- 讀取來源：`customer_service_config_versions`（`loadActiveCustomerServiceConfig`，`wati-customer-service/index.ts:1065`）。
- **Kill-switch 優先序**：`CUSTOMER_SERVICE_JEV_ENABLED=false`（環境）> DB `jev_enabled` > 預設 false。

### FR5　設定鏈路完整化
- DB：`customer_service_config_versions` 加欄位（§7.1）。
- list RPC：`customer_service_config_versions_list`（`20260904203000_customer_service_model_tiering.sql:37`）。
- create RPC：`customer_service_config_create_tiered`（同檔 :47）。
- 前端型別 `CustomerServiceConfigVersion` 與表單（`src/lib/customer-faq.ts:1151`、客服 FAQ 設定頁）。
- **preview / history replay 行為**：預設**不**跟隨 Jev（保持 Grok），需明示才啟用。
- Active config 變更後需驗證生效時間與快取失效。

### FR6　Telemetry（trace）
於既有 turn persistence **集中**寫入（模組不寫 DB）：`jev_intent`、`jev_intent_confidence`、`jev_dialog_action`、`jev_dialog_action_confidence`、`jev_requires_human_probability`、`jev_needs_clarification_probability`、`jev_model`、`jev_latency_ms`、`jev_input_tokens`、`jev_cost_usd`、`jev_outcome`、`jev_attempts`、`jev_error_code`、`jev_fallback_ok`、`jev_safety_override`、`jev_eligible`、`jev_reject_reason`。

### FR7　Evaluator 擴充（`customer-service-model-evaluate`）
現況限制（`index.ts:43` 最多 10 條；`:92–96` latency 含 FAQ 並行；`:85` 只由 Grok `model` 建 classifier）。必要改動：
- candidate 可選 `provider = jev | grok`；
- 支援 ≥200 樣本批次或可聚合 run；
- 新增 **classification-only latency**；
- 保存 per-sample raw decision；
- 新增 `high_risk_recall`、`accept_rate`、`fallback_rate`、`safety_override_rate`。

### FR8　Shadow 與延遲預算
- Shadow：Jev 與現有 Grok **並行**，Grok 為正式結果；Jev 只記錄。
- Live：Jev 用**總預算**（建議初始 800–1200ms），非每次嘗試預算；**同步路徑不重試**。
- 指標：p50/p95/p99 + 端到端新增延遲。

---

## 6. 技術設計

### 6.1 v2 流程

```
deterministic extraction + hard safety evidence
        ↓
prompt attack / explicit destructive action → deterministic final route   (FR3)
        ↓
Jev narrow decision (FR1)
        ↓
acceptance policy (FR2)
  ├─ 高信心且安全一致 → 合併 deterministic fields，直接定案
  └─ 低信心／矛盾／需生成澄清 → 原 Grok primary → fallback
        ↓
post-classification safety guards (FR3)
        ↓
routing (依 intent，非 requiresHuman)
```

### 6.2 Jev 問題映射

| Jev question | primitive | 用途 |
|---|---|---|
| `intent` | Choice（options = `enabledIntents[].intentKey`） | `intentKey` |
| `dialog_action` | Choice（10 值，同 `CustomerServiceAiClassification.dialogAction`） | `dialogAction` |
| `requires_human` | Noul | `requiresHumanProbability`（不預先二元化） |
| `needs_clarification` | Noul | `needsClarificationProbability` |
| — | — | `clarificationQuestion` 由 Grok |

### 6.3 失敗與降級

| 情況 | 行為 |
|---|---|
| `jev_enabled=false` | 完全走現狀，`trace.outcome=disabled` |
| `jev_shadow=true` | 並行呼叫、記錄，採用 Grok |
| `decision=null` / 逾時 / 5xx | 落 Grok，`outcome=error`、`fallbackOk` 記錄 |
| 低信心 / 不一致 / 需澄清 | 落 Grok，`outcome=escalated` |
| FR3 覆寫 | `outcome=safety_override`，健康度高 |

---

## 7. 資料庫變更

### 7.1 設定欄位（migration `20260922120000_customer_service_jev_config.sql`）
```sql
alter table public.customer_service_config_versions
  add column if not exists jev_enabled boolean not null default false,
  add column if not exists jev_shadow boolean not null default true,
  add column if not exists jev_model text not null default 'jev-latest',
  add column if not exists jev_accept_threshold numeric not null default 0.90,
  add column if not exists jev_requires_human_threshold numeric not null default 0.50,
  add column if not exists jev_budget_ms integer not null default 1000;
```
並更新 `customer_service_config_versions_list`、`customer_service_config_create_tiered`（含欄位校驗）。

### 7.2 Telemetry 欄位（migration `20260922121000_customer_service_jev_telemetry.sql`）
於 `customer_service_turns` 依 FR6 加欄位（含 `jev_model`）。遵循既有 RLS：`revoke ... from anon, authenticated`、`grant service_role`。

### 7.3 Secret
Supabase Secrets 加 `TYPESAFE_API_KEY`（`.env.example:110` 已有佔位）。**永不 `VITE_` 前綴。**

---

## 8. 非功能需求

| 類別 | 要求 |
|---|---|
| 延遲 | 同步路徑 Jev 總預算 ≤ 1200ms；不重試；p95 新增 ≤ 150ms |
| 可用性 | Jev 不可用 100% fallback，客服不中斷 |
| 成本 | 每千次呼叫 ≤ $0.05 |
| 安全 | key 只存 Secret；FR3 為最終權威；不可逆操作永不交模型授權 |
| 隱私 | 只送必要文本；沿用 `sanitizeCustomerServiceRecentMessages` |
| 冪等 | Jev 唯讀，無副作用 |
| 可回復 | kill-switch ≤60s |

---

## 9. 評估計劃（P0-3）

**資料集要求**（取代 v1 的 18 條）：
- ≥ 200 條**人工 gold**；
- 使用**生產完整 enabled intents** 與工具許可；
- 標籤含 `expected_intent`、`expected_dialog_action`、`expected_requires_human`、`expected_high_risk_route`；
- 覆蓋多輪 conversation state、否定、改口、混合意圖、模糊與非業務；
- 全部高風險與 prompt-injection 對抗案例；
- **按 intent 分層報告**，非只看總 accuracy。

`scripts/jev` 僅作探索；正式量測走 §FR7 evaluator 與人工複核。

---

## 10. 上線計劃

| 階段 | 開關 | 內容 | 出口條件 |
|---|---|---|---|
| P0 離線 | — | FR1 + FR3 + evaluator 擴充 + ≥200 gold 評估 | M1/M2/M4/M5 達標 |
| P1 Shadow | `jev_enabled=true, jev_shadow=true` | Grok 並行、只記錄 | 7 日 M2=1.00（人工標註）、M3 可預測、M6=100% |

**Live M2 標註流程**（P1 必要）：生產 trace 無法自動判斷 M2 正確性。需建立人工標註機制：
- **抽樣**：每小時從高風險候選（`safety_override=true` 或 `requiresHumanProbability ≥ 0.5`）隨機抽 10 條。
- **Review SLA**：24 小時內完成人工判斷（漏轉 / 正確轉 / 誤轉）。
- **回填 gold**：標註結果寫入 `customer_service_test_cases` 的 `expected_high_risk_route`，供後續評估使用。
- **M2 計算**：累積 7 日標註結果後計算 M2，而非即時計算。
| P2 灰度 | `jev_shadow=false`，穩定 hash 10%（key=`phone_normalized`+salt） | Jev 定案 | M7 達標、無回歸 |
| P3 全量 | 100% | 預設啟用 | 穩定 7 日 |
| P4 擴展 | — | guardrail / 離線學習批次 | 另行立項 |

**回復**：env kill-switch 或 DB `jev_enabled=false`，≤60s 生效。

---

## 11. 風險與緩解

| 風險 | 緩解 |
|---|---|
| 模型把破壞性動作判為一般查詢 | FR3 單向硬覆寫 + M2=1.00 |
| FR3 誤觸（把 FAQ 判成改單） | 以既有 `ORDER_HANDOFF` 證據 gating；回歸測試 + 人工抽樣誤觸率 |
| 中文/粵語校準未驗證 | P0/P1 用 FCCD gold；不達標不上線 |
| score/noul 邊界不穩 | 只用 confidence 分流；Noul 保留 raw 機率 |
| Jev 逾時拖慢 | 總預算 + 同步不重試 + 並行 shadow |
| 供應商依賴 | fail-open 至 Grok；需明確 ROI |
| 與 WATI 模板自動化混淆 | N5 明文：只影響路由，不構成發送批准 |
| 「Zero hallucination」誤解 | 文檔明示只保證輸出型別 |

---

## 12. 建議決策（原未決問題）

| # | 項目 | 建議 | 理據 | Owner | Status |
|---|---|---|---|---|---|
| 1 | `jev_accept_threshold` 初始值 | **0.90**；上線前用 gold 掃描：選「已接受樣本 intent precision ≥ 0.99」下 accept rate 最大者 | 實測 choice confidence 多為 1.0/0.99，0.90 不激進 | — | 待確認 |
| 2 | 灰度 hash key | `phone_normalized`（= `event.waId`，`index.ts:614`）＋ salt，`bucket = hash(salt + phone) % 100`；同一客戶在同一對話內**黏著**同一分桶 | waId 對每客戶穩定、跨對話一致 | — | 待確認 |
| 3 | preview / history replay 是否跟隨 Jev | **預設不跟隨**（維持 Grok）；提供 `classifier=jev` 顯式 opt-in | replay 用於回歸 baseline，引入 Jev 會污染對照 | — | 待確認 |
| 4 | FR3 誤觸容忍 | 破壞性召回 **100%**（硬）；非破壞性誤觸率 **≤ 1%**（gold 抽樣） | 漏轉代價 >> 誤轉代價 | — | 待確認 |
| 5 | 200+ gold 來源 | 主：`customer_service_test_cases` 新增 `expected_requires_human`、`expected_high_risk_route`；輔：`customer_service_turn_feedback` 與 history replay approved | 三者皆已存在且可查詢 | — | 待確認 |
| 6 | TypeSafe API contract 核對 | 實作前以 `scripts/jev` 產出並簽入 contract fixture | 已有 live 實測與 `test/jev-client.test.ts` 可作基礎 | — | 待確認 |

> **狀態說明**：「待確認」= 建議值已附理據，但尚無 owner 簽署。未簽前 FR1/FR3 可先以 mock/單元層落地，不接生產流量。

---

## 附錄 A：與現有元件的關係

| 元件 | 用法 |
|---|---|
| `shouldBypassCustomerServiceAi`（`intents.ts:211`） | 現僅 bypass `prompt_injection`；FR3 以此為基礎擴充 |
| `classifyCustomerServiceWithTieredAi`（`ai.ts:623`） | Jev 前置 + accept policy，保留原升階 |
| `explicitCustomerServiceOrderNumber`（`intents.ts:218`） | 訂單號校驗沿用 |
| `ACTION_INTENTS` / `ACTION_TO_REQUIRED_TOOL`（`index.ts:238/247`） | intent/tool 推導與許可閘 |
| `loadActiveCustomerServiceConfig`（`index.ts:1065`） | 讀取 config 來源 |
| 設定 RPC（`20260904203000_*.sql:37/47`） | 新增欄位需同步更新 |
| `customer-service-model-evaluate` | 依 FR7 擴充 |
| 客服回歸測試 | FR3 零回歸驗證 |

## 附錄 B：驗收清單

- [ ] `jev_enabled=false` 時生產位元級等價現狀
- [ ] Jev 失敗 100% fallback（M6）
- [ ] 高風險路由召回率 = 1.00（M2，人工 gold）
- [ ] FR3 對 Grok 結果同樣生效，且單向保守
- [ ] 窄介面無空欄位偽造；`clarificationQuestion` 仍由 Grok
- [ ] evaluator 能出 classification-only latency、high-risk recall、per-sample raw
- [ ] 設定 list/create RPC 與前端表單可讀寫 Jev 欄位
- [ ] env kill-switch 優先於 DB，≤60s 生效
- [ ] 灰度穩定 hash 可重現
- [ ] 客服回歸測試全綠
