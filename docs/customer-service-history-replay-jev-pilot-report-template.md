# 客服歷史回放：Jev 第二評判試點評估報告模板

> 對應 PRD：`docs/CUSTOMER_SERVICE_HISTORY_REPLAY_JEV_SECOND_JUDGE_PRD.md`
> 狀態：模板，尚待填寫。**通過功能驗收不等於批准 Jev 決定正式修復或即時回覆。**

## 1. 基本資料

| 項目 | 內容 |
| --- | --- |
| 環境 | develop / staging（不可用正式客戶資料做線上測試） |
| run_id | |
| 樣本數 / 可評估數 | |
| Jev 模型（requested / resolved） | |
| Jev rubric 版本 | history-jev-v1 |
| 現有 judge 模型 / rubric | |
| 執行日期 | |
| 執行人員 | |

## 2. 配置與範圍

- `CUSTOMER_SERVICE_HISTORY_JEV_ENABLED` 是否開啟：是／否
- `TYPESAFE_API_KEY` 是否只在 Supabase secrets：是／否
- 只對 `answer_quality` 且 `status = scored` 樣本評估：是／否
- 跳過樣本原因統計（`routing_safety`、`pairing_uncertain`、`context_gap`、
  `retrieval_error`、`answer_guard_blocked`、`unverified_sources_not_evaluable`、
  `no_answer`、`deterministic_blocked`）：各項數量

## 3. 人工標註集

- 樣本數（建議 ≥ 50）：____
- 語言／地區：香港繁體／廣東話
- 去重方式：____
- 覆蓋類別與數量：正確回覆、漏答、錯政策、引用錯誤、急單／投訴、否定句、
  多意圖、舊真人答案過時、無核實來源、日期及金額
- 標註依據是否記錄：是／否
- 模型能否讀到標準答案：否（必須為否）

## 4. Grounding 混淆矩陣

現有 judge（rows）對人工標註（columns）：

| judge \ 人工 | supported | unsupported | conflicting | unknown |
| --- | --- | --- | --- | --- |
| supported | | | | |
| unsupported | | | | |
| conflicting | | | | |
| unknown | | | | |

Jev（rows）對人工標註（columns）：

| Jev \ 人工 | supported | unsupported | conflicting | unknown |
| --- | --- | --- | --- | --- |
| supported | | | | |
| unsupported | | | | |
| conflicting | | | | |
| unknown | | | | |

## 5. 指標

| 指標 | 數值 |
| --- | --- |
| 人工覆核命中率（Jev human_review vs 人工需覆核） | |
| `grounding` 一致樣本 | |
| `grounding` 分歧樣本 | |
| `無法比較`（unknown／未完成）比例 | |
| Jev 服務失敗率 | |
| 平均延遲（ms / 樣本） | |
| 平均 input tokens / 樣本 | |
| 平均 output tokens / 樣本 | |

## 6. 分歧樣本清單

| sample_id | 現有 aiGrounding | Jev grounding | 人工結論 | 需覆核 | 備註 |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## 7. 已知缺口與風險

- 未能證明已核實來源而標為不可評估的樣本數量與原因。
- Jev 概率未經本地校準，僅作排序參考；門檻未設定。
- 逾時／`outcome_uncertain` 樣本可能已計費。
- 其他：

## 8. 結論與下一步

- 功能驗收是否通過：是／否
- 是否建議進入下一階段（例如為概率設定門檻、擴大樣本）：是／否
- 未經獨立授權，Jev 結果不得啟動或批准 `auto_repair`、`propose`、
  `validate_proposal`、`apply_proposal`，亦不得接入即時 WhatsApp 發送、
  FAQ 編輯、訂單操作或對話路由。
