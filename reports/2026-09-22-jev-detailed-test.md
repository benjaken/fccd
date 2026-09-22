# Jev 詳細測試報告 — 2026-09-22（v3）

> **定位聲明（重要）**：本報告是**探索性 smoke test**，不是生產准入依據。n=18、只有 3 個 intent、標籤由作者標註。生產准入需依 `2026-09-22-jev-customer-service-integration-prd.md` 的評估要求（≥200 條人工 gold、完整 enabled intents、多輪與對抗案例）。v3 修正了 v2 一項與 FCCD 政策衝突的 criteria，詳見 §7。

## 目的

以 FCCD 客服語料題型，實測 Jev 的判斷準確度、run-to-run 穩定性、延遲與成本；驗證 `scripts/jev` 工具鏈端到端可用。

## 受測設定

| 項目 | 值 |
|---|---|
| 模型 | `jev-latest` |
| Endpoint | `https://api.typesafe.ai/v1/systemone` |
| 資料集 | `scripts/jev/datasets/fccd-customer-service.json` |
| 案例數 | 18（8 改單 / 7 新查詢 / 3 非業務） |
| 問題數 | 4（1 choice + 2 noul + 1 score） |
| 重複次數 | repeat = 3 |
| 總呼叫 | 18 × 3 = **54 次 API 呼叫** |
| 數值容差 | tolerance = 0.05 |
| 判定題 | `intent`（choice，唯一有 gold 標籤） |

問題：`intent`(choice: handoff_order/collect_inquiry/unclear)、`urgency`(noul)、`needs_human`(noul)、`friction`(score 0–3)。

## 總體結果

| 指標 | 結果 |
|---|---|
| Smoke-set agreement（intent） | **18/18**（僅 3 intent，作者標籤） |
| Self-consistency（intent，3 次） | **100.0%** |
| Answer agreement（全部問題、容差 0.05） | **100.0%** |
| 延遲 | mean 564.5ms / p50 342.7ms / p90 1219.6ms / max 1701ms |
| ⚠ M4 達標狀態 | **未達標**：p50 343ms > 300ms 目標；p90 1220ms > p95 800ms 目標。非僅首呼冷啟動——後續案例亦出現 1.1–1.5s。需更多樣本重新驗證 |
| 成本（**已修正算法**） | 總 **$0.00153993**；**54 calls**；每 call **$0.0000285**；每千次呼叫 **$0.0285**；每千個案例（3 calls）$0.0856 |
| Tokens | input 36,666 / output 5,175（output 免費） |
| 校準 | mean confidence（答對）0.999，Brier 0 |

> 成本單位說明：v1/v2 報告曾把「per-1k」誤算成 `totalCost × 1000`（=$1.458/1k），實際是**每千個「案例行」**。v3 已分開列 `per-1k calls` 與 `per-1k cases`（recorder 修正為 `perThousandRowsUsd`，並在 CLI 另計 calls）。

## 各問題穩定性（3 次重跑，容差 0.05）

| 問題 | 型別 | 容差內一致率 | 超出容差案例 |
|---|---|---|---|
| intent | choice | **100.0%** | — |
| urgency | noul | **100.0%** | — |
| needs_human | noul | **100.0%** | — |
| friction | score | **100.0%** | — |

## 逐案結果（最後一次重跑）

| case | 訊息 | intent (conf) | urgency | needs_human | friction (conf) |
|---|---|---|---|---|---|
| oc-1 | 我想改送貨日期 | handoff_order (1) | 0.12 | **0.74** | 0 (1) |
| oc-2 | B-1555 改到星期五 | handoff_order (1) | 0.14 | **0.89** | 0 (1) |
| oc-3 | 可唔可以改送貨地址 | handoff_order (1) | 0.09 | **0.83** | 0 (1) |
| oc-4 | 唔係改期，係取消張單 | handoff_order (1) | 0.10 | **0.89** | 0.69 (0.52) |
| oc-5 | 我想將自取改做送貨 | handoff_order (1) | 0.07 | **0.85** | 0 (1) |
| oc-6 | 張單要改人數 | handoff_order (1) | 0.11 | **0.84** | 0.01 (0.99) |
| oc-7 | 先改張單，另外想訂多20人 | handoff_order (1) | 0.13 | **0.88** | 0.01 (0.99) |
| oc-8 | Can I change my delivery date to next Friday? | handoff_order (1) | 0.17 | **0.74** | 0 (1) |
| in-1 | 我想訂20人到會 | collect_inquiry (1) | 0.05 | 0.12 | 0 (1) |
| in-2 | 9月10日想訂餐 | collect_inquiry (1) | 0.21 | 0.09 | 0 (1) |
| in-3 | 想問公司午餐報價 | collect_inquiry (1) | 0.06 | 0.09 | 0 (1) |
| in-4 | 二十人食素有咩選擇 | collect_inquiry (1) | 0.07 | 0.10 | 0.04 (0.96) |
| in-5 | 下星期五要30人茶會 | collect_inquiry (1) | **0.46** | 0.17 | 0 (1) |
| in-6 | 想訂早餐 | collect_inquiry (0.99) | 0.15 | 0.10 | 0 (1) |
| in-7 | 想問下你哋有咩套餐 | collect_inquiry (1) | 0.04 | 0.08 | 0 (1) |
| un-1 | Hello | unclear (1) | 0.02 | 0.10 | 0 (1) |
| un-2 | thanks | unclear (1) | 0.02 | 0.12 | 0 (1) |
| un-3 | ？？？ | unclear (1) | 0.07 | 0.42 | 0.08 (0.92) |

## 主要發現

1. **Choice 分類穩定且正確（在此小集合）**：18/18，confidence 幾乎全為 1.0，三次重跑一致。含否定句（oc-4）、混合意圖（oc-7）、英文（oc-8）。
2. **`needs_human`（修正 criteria 後）能清楚分開破壞性動作與新查詢**：8 個改單案例 0.74–0.89，7 個新查詢 0.08–0.17，非業務 0.10–0.42。分界明顯，適合作路由訊號（但仍須 deterministic guard，見 PRD）。
3. **Noul 接近 0.5 代表「不確定」**：in-5（下星期五要30人茶會）urgency = 0.46，屬真歧義，應交規則或人工，不應視為中等急迫。
4. **Score 在模糊中間值最不穩（跨 run 觀察）**：v2 曾見 oc-4 friction 0.59–0.65（confidence 僅 0.41–0.52）。結論：不要對原始 score 硬設門檻，要用 confidence 分流。
5. **延遲**：p50 343ms；首呼冷啟動 ~1.7s。**Shadow/live 設計需用總預算與 p95/p99，而非單次 timeout**（見 PRD）。
6. **成本**：一次 4 題判斷約 $0.0000285（output 免費），每千次呼叫約 $0.029。

## 注意事項

**v2→v3 `needs_human` delta**（criteria 改動後）：

| 類別 | v2 範圍 | v3 範圍 | delta |
|---|---|---|---|
| 改單案例（8 個） | ~0.10–0.20 | 0.74–0.89 | **+0.53 至 +0.76** |
| 新查詢案例（7 個） | ~0.08–0.15 | 0.08–0.17 | −0.06 至 +0.02 |
| 非業務案例（3 個） | ~0.10–0.40 | 0.10–0.42 | −0.02 至 +0.02 |

改單案例的 `needs_human` 大幅上升，驗證了 criteria 修正的方向正確（改單需人工）。

- n=18、作者標籤、3 個 intent，**不足以支撐生產准入**。
- `urgency`／`needs_human`／`friction` 無 gold label，僅量測穩定性，未量測正確性。
- 容差 0.05：v1 用精確相等會把 0.12 vs 0.13 誤判為不一致；校準模型須用容忍帶。
- 依 TypeSafe，confidence 只反映機率分布集中度，不代表流程正確或可執行。
- v2→v3 criteria 改動：原 `needs_human` 把「routine order change」列為不需人工，**與 FCCD 改單政策相反**；v3 已改為「改 / 取消 / 退款既有訂單需人工」。故 v2 與 v3 的 `needs_human` 數值**不可直接比較**。

## 產出檔案

- 原始完整報告（含每次呼叫 answers 與三次數值）：`reports/2026-09-22-jev-detailed-test.json`
- 逐次決策 JSONL：`output/jev-decisions.jsonl`（`output/` 已 gitignore）
- 資料集：`scripts/jev/datasets/fccd-customer-service.json`

## 重現指令

```powershell
node --env-file-if-exists=.env.local scripts/jev/benchmark.mjs `
  --cases=scripts/jev/datasets/fccd-customer-service.json `
  --repeat=3 --tolerance=0.05 --tag=detailed-2026-09-22-v3 `
  --out=output/jev-tests/2026-09-22-detailed-v3.json
```
