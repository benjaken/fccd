# PRD：Jev 接入 FCCD 智能客服意圖分類

| 項目 | 內容 |
|---|---|
| 狀態 | Draft v3（含實測數據） |
| 日期 | 2026-09-22 |
| 版本 | v3（整合 gold-dataset 評估結果） |
| 上游 | v2 評審修正、gold-v3 評估 |
| 涉及系統 | `wati-customer-service`、`customer-service-ai`、`customer-service-bot` |

---

## 1. 結論（先睇呢段）

以 153 條人工標註真實客服訊息實測，**Jev 喺 7-intent 分類上直接準確率 67.3%，配合 confidence gating（threshold 0.80）可達 ~93% accepted precision（55% 覆蓋率）**。剩低 45% escalate 俾 Grok。

Jev 嘅核心價值唔係「比 Grok 更準」，而係**知道自己幾時唔確定**（答對平均信心 0.863 vs 答錯 0.559），令你可以用 confidence 做分流，將高頻低風險判斷交俾又快又平嘅 Jev，將不確定案例交俾 Grok。

**建議**：以 confidence-gated 前置分類層接入，配合 FR3 安全閘，分階段上線。

---

## 2. 問題

現行分類（規則 + Grok）嘅痛點：
1. 每條訊息都要生成式模型吐 JSON——慢（Grok p50 ~1s+）、貴（~$0.001/call）、有格式幻覺風險。
2. 高頻低風險判斷（意圖分類）與需要推理嘅判斷混喺同一模型。
3. 模型唔知道自己幾時唔確定——冇校準機率，無法做有效分流。

---

## 3. 實測數據（153 條人工標註 gold dataset）

### 3.1 準確度

| 計法 | 數值 |
|---|---|
| 直接準確率（7 intent） | **67.3%**（103/153） |
| Confidence gating（threshold 0.80）accepted precision | **~93%** |
| Accept rate（conf ≥ 0.80） | **~55%** |
| Escalate rate（conf < 0.80） | **~45%** |

### 3.2 校準（Jev 知道自己幾時唔確定）

| | 答對（103） | 答錯（50） |
|---|---|---|
| 平均 confidence | **0.863** | **0.559** |
| Brier score | **0.148** | |

答錯嘅時候信心明顯低——呢個係 confidence gating 嘅基礎。

### 3.3 效能

| 指標 | 數值 |
|---|---|
| Latency p50 | 331ms |
| Latency p90 | 616ms |
| Self-consistency（3 次重跑） | 96.7% |
| Cost per call | $0.000062 |
| Cost per 1k calls | **$0.021** |

### 3.4 各 intent 表現

| Intent | 樣本 | 主要混淆 |
|---|---|---|
| `search_faq` | 39 | 同 `collect_inquiry` / `handoff` 邊界 |
| `handoff` | 59 | 標注曾過度使用（51% → 38%），仍有含糊案例 |
| `collect_inquiry` | 28 | 同 `search_faq` 邊界（新查詢 vs 政策問題） |
| `handoff_order` | 16 | 同 `handoff` 邊界（投訴 vs 改單） |
| `lookup_order` | 4 | 同 `search_faq` 邊界 |
| `out_of_scope` | 6 | 表現良好 |
| `prompt_injection` | 1 | 樣本不足 |

### 3.5 誤差分析

50 個分歧中：
- **含糊案例（Jev 信心 0.3-0.7）**：~35 條，適合 escalate
- **Jev 高信心但錯**：~6 條（`handoff` vs `handoff_order` 邊界）
- **標注仍有噪聲**：~9 條（`handoff` 定義闊窄不一）

---

## 4. 目標與非目標

### 目標
- G1：以 Jev 作為分類前置層，達標者直接定案，降低延遲與成本。
- G2：以 `applyClassificationSafetyGuards()`（FR3）作統一安全權威。
- G3：全程零客戶行為改變（shadow）；可一鍵回復。
- G4：利用既有 `customer-service-model-evaluate` 產出可比較指標。

### 非目標
- N1：Jev 不生成任何客戶可見文字。
- N2：Jev 不授權不可逆操作；破壞性動作由 FR3 硬規則兜底。
- N3：Jev 不做訂單事實查詢。
- N4：不新增獨立評估平台、不重寫 RAG。
- N5：**Jev 分類只影響客服路由**，不構成 WATI 模板自動化或發送批准。

---

## 5. 架構

```
WhatsApp → 規則分類器 (prompt_injection bypass)
         → Jev 前置分類（窄介面，~300ms，~$0.00006）
              ├─ confidence ≥ 0.80 且安全一致 → 直接定案
              └─ confidence < 0.80 / 不一致 / 失敗 → Grok primary → fallback
         → FR3 Safety Guard（單向保守覆寫）
         → RAG grounding + Grok 生成回覆
         → deterministic blockers → send / 追問 / 轉人工
```

### 5.1 Jev 窄介面

```ts
type CustomerServiceJevDecision = {
  intentKey: string;
  intentConfidence: number;
  dialogAction: DialogAction;
  dialogActionConfidence: number;
  requiresHumanProbability: number;      // raw Noul
  needsClarificationProbability: number; // raw Noul
  model: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
};
```

不偽造欄位。`orderNumber`/`requestedDate`/`clarificationQuestion` 由 deterministic 抽取器 / Grok 負責。

### 5.2 Acceptance Policy（按 actionKey 風險分類）

| 條件 | 低風險 actionKey | 高風險 actionKey |
|---|---|---|
| `intentConfidence` | ≥ 0.80 | ≥ 0.95 |
| `requiresHumanProbability` | < 0.50 | ≥ 0.50 |
| `needsClarificationProbability` | < 0.50 | < 0.50 |
| `dialogActionConfidence` | ≥ 0.80 | ≥ 0.80 |

不一致 → 升 Grok。最終路由仍由 FR3 覆寫。

### 5.3 FR3 Safety Guard

- 單向覆寫：只會推向更保守（轉人工），永不降級。
- `SafetyRoute`：`none` / `human.general` / `human.order_change` / `refuse`。
- 對**所有**分類結果（規則/Jev/Grok）生效。
- Route precedence：`refuse` > `human.order_change` > `human.general` > `none`。
- `safetyRoute` 對 pilot/dialogAction 有最高優先權（防 `cancel_current` 繞過 handoff）。
- 否定作用域：clause segmentation 處理「唔想取消」「先唔改住」。
- Policy form：「取消政策係點」「改期手續費幾多」唔觸發 handoff。

---

## 6. 成功指標

| 編號 | 指標 | 門檻 | 實測基線 |
|---|---|---|---|
| M1 | Accepted-set intent precision | ≥ 0.90 | **~93%** ✅ |
| M2 | 高風險路由召回率（人工 gold） | = 1.00 | 待 FR3 測試 |
| M3a | Accept rate（ROI 門檻） | ≥ 0.40 | **~55%** ✅ |
| M3b | Accept rate > 0.80 | 漂移告警 | — |
| M4 | Classification latency p50 | ≤ 350ms | **331ms** ✅ |
| M4b | Classification latency p95 | ≤ 800ms | **616ms** (p90) ✅ |
| M5 | Cost per 1k calls | ≤ $0.05 | **$0.021** ✅ |
| M6 | Jev 失敗 fallback 成功率 | 100% | 待測 |
| M7 | 端到端新增延遲 p95 | ≤ 150ms | 待測 |
| M8 | Kill-switch 生效 | ≤ 60s | 待測 |

---

## 7. 上線計劃

| 階段 | 開關 | 內容 | 出口條件 |
|---|---|---|---|
| **P0 離線** | — | FR1 + FR3 + evaluator 擴充 | M1/M4/M5 達標（已達） |
| **P1 Shadow** | `jev_enabled=true, jev_shadow=true` | Grok 並行、只記錄 | 7 日 M2=1.00（人工標注）、M6=100% |
| **P2 灰度** | `jev_shadow=false`，穩定 hash 10% | Jev 定案 | M7 達標、無回歸 |
| **P3 全量** | 100% | 預設啟用 | 穩定 7 日 |
| **P4 擴展** | — | guardrail / 離線學習批次 | 另行立項 |

**回復**：env kill-switch 或 DB `jev_enabled=false`，≤60s 生效。

---

## 8. 資料庫變更

```sql
-- migration 20260922120000_customer_service_jev_config.sql
alter table public.customer_service_config_versions
  add column if not exists jev_enabled boolean not null default false,
  add column if not exists jev_shadow boolean not null default true,
  add column if not exists jev_model text not null default 'jev-latest',
  add column if not exists jev_accept_threshold numeric not null default 0.80,
  add column if not exists jev_requires_human_threshold numeric not null default 0.50,
  add column if not exists jev_budget_ms integer not null default 1000;
```

同步更新 `customer_service_config_versions_list`、`customer_service_config_create_tiered`、前端型別與表單。

Secret：`TYPESAFE_API_KEY`（Supabase Secrets）。

---

## 9. 風險與緩解

| 風險 | 緩解 |
|---|---|
| 破壞性動作漏轉 | FR3 單向硬覆寫 + M2=1.00 |
| 模型自信錯誤 | Confidence gating（實測答錯平均信心 0.559） |
| `handoff` vs `handoff_order` 邊界 | FR3 細分 route；escalate 不確定案例 |
| 中文/粵語校準 | 已用 153 條真實數據驗證；持續監控 |
| Jev 逾時 | 總預算 1000ms + 同步不重試 + fallback |
| 供應商依賴 | fail-open 至 Grok |
| 「Zero hallucination」誤解 | 只保證輸出型別，唔保證判斷正確 |

---

## 10. 附錄

### A. 評估數據集
- `fccd-annotated.json`：153 條人工標註（3 輪迭代修正）
- 來源：`customer_service_history_eval_samples`（98 條）+ `customer_service_turns` + 回歸 fixtures
- 標注工具：`reports/annotate-intent.html`、`reports/annotate-review.html`、`reports/annotate-review2.html`

### B. 評估報告
- `output/jev-tests/gold-v3.json`：完整評估結果
- `reports/2026-09-22-jev-detailed-test.md`：早期 smoke test
- `reports/2026-09-22-jev-fr3-safety-guards-spec.md`：FR3 詳細設計

### C. 重現指令
```powershell
node --env-file-if-exists=.env.local scripts/jev/benchmark.mjs `
  --cases=fccd-annotated.json --repeat=3 --tag=gold-v3 --question=intent `
  --out=output/jev-tests/gold-v3.json
```
