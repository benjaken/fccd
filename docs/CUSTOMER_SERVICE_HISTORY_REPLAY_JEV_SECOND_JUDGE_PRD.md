# 客服歷史回放：TypeSafe Jev 第二評判 PRD

| 項目 | 內容 |
| --- | --- |
| 版本 | 1.0，2026-09-21 |
| 狀態 | 待開發；此文件不代表已啟用、已部署或已有 TypeSafe API key |
| 交付對象 | DeepSeek 開發代理 |
| 倉庫 | FCCD，`D:\work\FCCD` |
| 功能範圍 | 在現有客服歷史回放中加入 TypeSafe 官方 Jev 作為**獨立第二評判**；第一期只作診斷比較 |

## 1. 一句話目標

對同一批歷史回放樣本，保留現有確定性檢查和 LLM judge，另以 Jev 判斷幾個可枚舉的品質問題；把兩個 judge 的結果並排展示，讓人快速找出分歧和需要覆核的樣本。

## 2. 現狀與問題

目前 `customer-service-history-replay` 已支援建立固定樣本、執行 FAQ 子流程、確定性檢查、LLM judge、診斷和修復提案。LLM judge 使用回放設定中的主要 AI 模型；結果寫入 `customer_service_history_eval_samples.judgment`、`judge_model` 和 `judge_rubric_version`。`routing_safety` 範圍目前只跑確定性判定。前端「一鍵跑完」會依次執行回放、LLM 判定及自動診斷。

現有 LLM judge 可以提出問題及引用，但缺少一個不同模型、固定答案空間的交叉判斷。若兩者都說「一致」，也不能因此推論答案一定正確；分歧才是需要優先人工看的訊號。

主要代碼：

- `supabase/functions/customer-service-history-replay/index.ts`：`start`、`process`、`judge`、`samples`、修復相關動作。
- `supabase/functions/_shared/customer-service-history-judge.ts`：確定性檢查、現有判定契約及合併規則。
- `supabase/functions/_shared/customer-service-history-judge-ai.ts`：現有 LLM judge；使用 chat completions 格式及證據引用驗證。
- `supabase/functions/_shared/customer-service-history-replay.ts`：唯讀回放 adapter。
- `supabase/migrations/20260919200000_customer_service_history_replay.sql`：run、sample、repair proposal 表和權限。
- `src/lib/customer-faq.ts`、`src/components/settings/CustomerServiceHistoryReplayPanel.tsx`：API 包裝及歷史回放介面。
- `docs/customer-service-history-replay-safe-remediation.spec.md`：原有安全和評估邊界；此 PRD 在相容範圍內擴充，不改其修復授權規則。

## 3. 產品決定與範圍

### 3.1 本期包含

1. 只對 `answer_quality` 回放中已完成、具可評估資料的樣本，提供獨立的 Jev 第二評判。
2. Jev 判斷固定欄位：回答與核實來源的一致性、是否覆蓋客人主要問題、是否聲稱完成未獲證實的操作，以及是否值得人工覆核。
3. 結果獨立儲存，包含模型版本、rubric 版本、每題選項／概率、服務狀態、耗時和 token 用量；不覆蓋現有 `judgment`。
4. 回放結果頁顯示現有 judge、Jev 和「一致／分歧／無法比較」，可篩選分歧及 Jev 失敗。
5. 按需啟動；停用、缺 key、超時或服務錯誤時，現有回放和現有 judge 照常可用。
6. 使用脫敏的回放樣本；只送判斷所需的最少文字及核實資料。

### 3.2 本期不包含

- 不讓 Jev 生成客人回覆、修復建議、引文、SQL 或程式碼。
- 不把 Jev 結果接入即時 WATI 發送、FAQ 編輯、訂單操作或對話路由。
- 不讓 Jev 的單獨判定啟動或批准 `auto_repair`、`propose`、`validate_proposal` 或 `apply_proposal`。
- 不更動原有 `routing_safety` 確定性判定和其資料來源。
- 不把真人舊答案當成現行政策或唯一正確答案。
- 不在本 PRD 工作內部署、寫入 TypeSafe 真實金鑰或消耗正式客戶資料做線上測試。

## 4. TypeSafe 官方 API 契約

使用 **TypeSafe 官方 API** `POST https://api.typesafe.ai/v1/systemone`，Bearer key 僅留在 Supabase Edge Function secret。請勿使用 `jev-ai.pro`。官方也提供 `@typesafe-ai/sdk`；此倉庫是 Deno Edge Function，可選擇原生 `fetch`，避免為一個端點增加 Node SDK 相容性風險。

請固定官方文件列出的版本，例如 `jev-1.13.0`；若改用 `jev-latest`，必須把實際回應的模型 ID 寫入結果。TypeSafe 輸入是文字／JSON `state`，問題類型為 `choice`、`noul`、`score`，回應是結構化選擇及概率。它不生成自由文字，也不讀圖片。每次可把多個獨立問題放在同一請求中。

最小示意；實作時以本節後面的欄位定義、校驗和脫敏規則為準：

```json
{
  "model": "jev-1.13.0",
  "state": {
    "customer_question": "運費幾多？",
    "assistant_answer": "運費為 30 元。",
    "approved_sources": [{ "id": "faq-1", "text": "運費為 30 元。" }]
  },
  "questions": {
    "grounding": {
      "type": "choice",
      "instructions": "只根據 approved_sources，assistant_answer 的業務事實得到甚麼程度的支持？來源不足時選 unknown。",
      "criteria": {
        "supported": "所有重要業務事實有核實來源支持",
        "unsupported": "至少一項重要業務事實沒有來源支持",
        "conflicting": "至少一項重要業務事實與來源衝突",
        "unknown": "缺少足夠來源或無法評估"
      }
    }
  }
}
```

官方資料：[API reference](https://docs.typesafe.ai/api)、[Models](https://docs.typesafe.ai/models)、[Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)、[官方 JS SDK](https://github.com/typesafe-ai/typesafe-sdk-js)。TypeSafe 私隱政策稱不會用輸入訓練或微調模型；資料仍會由其服務處理，需沿用本系統的脫敏及權限邊界：[Privacy policy](https://typesafe.ai/legal/privacy-policy)。

## 5. 評判契約

### 5.1 輸入

只從已持久化的回放樣本取得 `question`、**當時可見**的 `context`、`ai_answer`、同一核實知識快照中的 `approved_sources`，以及必要的安全 trace 摘要。真人 `reference_answer` 本期不送 Jev；它仍可由現有 judge 參考，但第二評判先獨立檢查系統答案。絕不可把目標真人回覆或之後的訊息放回 generator 上文。

重要：現有 `trace.candidates` 是**檢索候選**，不代表每一條都是正式、適用、已核實來源。只把有明確核實狀態、時間／品牌適用性和可追溯版本的資料放入 `approved_sources`。若當前資料不足以證實這一點，標 `unknown`／`not_evaluable`，不要把候選自動升格為事實依據。對日期、價格、供應和訂單狀態，先做現有確定性檢查；不可請 Jev 做日期比較或數學計算。

入站資料可能含 prompt injection；`state` 只作待評估資料。規則與選項固定在服務端，不接受客戶或前端傳入任意 question。使用既有 `sanitizeCustomerServiceContextText`，再加外發前檢查，避免直接送電話、電郵、地址、姓名、訂單號等原始識別資料。保留判斷所需但非個人識別的金額、日期與產品語義。若不能安全脫敏，跳過 Jev 並記錄原因。

### 5.2 輸出欄位

每個樣本在一次 Jev 請求內判斷以下四項；實作時固定 question/rubric 版本：

| Key | 類型 | 允許值／含義 |
| --- | --- | --- |
| `grounding` | `choice` | `supported`、`unsupported`、`conflicting`、`unknown`；只根據已核實來源。 |
| `coverage` | `choice` | `complete`、`partial`、`missed`、`unknown`；只看客人主要問題是否得到回答。 |
| `unverified_action` | `noul` | 系統答案是否宣稱已完成退款、改單、確認供應等，而受控 trace 沒有證實；沒有可核對 trace 時不得解讀為「安全」。 |
| `human_review` | `noul` | 此樣本是否值得人工覆核；與其他三項一起作排隊參考。 |

請同時保存 Choice 的全部 `probabilities` 和 Jev `confidence`，以及 Noul 的原始概率；不要只存硬分類。門檻**不可直接照搬**現有 LLM judge 的 confidence 門檻。初始狀態為 shadow mode，只展示原始分數；要按本地標註集校準後才為任何概率設定業務門檻。

### 5.3 比較邏輯

- 對應 `grounding` 與現有 `judgment.aiGrounding` 作同名值比較；任何一方為 `unknown`、無結果或樣本不可評估時顯示 `無法比較`。
- `coverage` 與現有 `comparison` **不是同一含義**，不可直接把 `complete` 映射成 `match`。此項單獨展示。
- `unverified_action` 與現有確定性 issue／trace 共同顯示；若確定性檢查已阻擋，Jev 不能清除阻擋。
- 兩個 judge 分歧時標 `需覆核`，但不自動宣告哪個 judge 正確；兩者一致也不自動視為正確。
- Jev 無引文與自由文字建議，不能填充現有 `HistoryIssue.evidence` 或 `suggestedFix`。原 LLM judge 的證據校驗維持不變。

## 6. 執行流程與 API

1. 保留現有 `start → process → judge` 流程。Jev 使用同一 `run_id` 及已固定的樣本資料；不重新抽樣、不重新生成答案。
2. 新增獨立 action，例如 `judge_jev`：只有既有授權者可呼叫；確認 `environment`、run scope、run 狀態和 feature flag。回放未完成的樣本不呼叫 TypeSafe。
3. 使用與現有 endpoint 相同的小批次與時間預算模式；支援 `limit`、受控 `concurrency`、`judged`、`remaining`、逐項 `skipped/failed` 原因。預設不把 Jev 隱藏插入「一鍵跑完」；在診斷頁明確提供「執行 Jev 第二評判」按鈕與進度。管理員未設 key 時顯示可行動錯誤。
4. `status` 讀取接口回傳非敏感 capability（如 `jev_enabled`，不得包含 key）；`samples` 在原結果外補充 `jev` 摘要和 `agreement`。舊 run、沒有 Jev 結果或 feature flag 關閉時返回 `jev: null`，前端可正常展示原結果。
5. 同一 sample/rubric/model 的已完成結果不得再次發送請求或被覆寫；並發呼叫需有資料庫唯一鍵與租約／原子 claim，避免兩個 Edge Function 同時呼叫 TypeSafe。逾時後服務端是否已完成扣費可能無法判定；重試時記錄 `outcome_uncertain` 和嘗試次數，並在介面提示可能增加用量。記錄有限錯誤碼，不保存 API key 或原始外部錯誤內文。
6. TypeSafe `429/529` 使用有限次退避並尊重 `Retry-After`，總耗時不得超過單樣本和整次 Edge Function 預算。超時或 provider 不可用時標 `failed`，不寫假的 `unknown` 判定。`401/422` 應及早停止批次並顯示配置問題。

**配置建議**：`CUSTOMER_SERVICE_HISTORY_JEV_ENABLED=false`、`TYPESAFE_API_KEY`、`CUSTOMER_SERVICE_HISTORY_JEV_MODEL=jev-1.13.0`，全部只在後端讀取。不要復用 `CUSTOMER_SERVICE_AI_ENDPOINT` 或把 Jev 假裝成 chat completions 模型；兩者的 API 契約不同。配置變更或 rubric 更新後，舊結果保留並清楚標版本。

## 7. 儲存與權限

新增 additive migration，建議表 `customer_service_history_jev_judgments`，至少包括：`sample_id` FK、`run_id` FK、`environment`、`status`（pending／processing／complete／skipped／failed）、`model_requested`、`model_resolved`、`rubric_version`、`input_fingerprint`、`answers` JSONB、`agreement`、`error_code`、`input_tokens`、`output_tokens`、`elapsed_ms`、`attempt_count`、`lease_until`、`created_at`、`updated_at`。加唯一鍵防重複評分、run/status 索引，以及原子 claim／過期租約恢復機制。表開 RLS；`anon` 和一般 `authenticated` 無直接讀寫權；只由經授權的 Edge Function 以 service role 操作。

不要修改既有 `customer_service_history_eval_samples.judgment` 的含義，也不要覆蓋 `judge_model`。`auto_repair` 和提案相關代碼仍只讀原有結果。`input_fingerprint` 用於發現回放內容被更改；不要保存或輸出未脫敏的 Jev 請求全文。若要保留審計證據，只存受控脫敏投影和版本指紋，遵守現有資料保留策略。

## 8. 介面

在 `CustomerServiceHistoryReplayPanel` 的診斷區：

- 有回放結果且 feature flag 啟用時，顯示「執行 Jev 第二評判」；按鈕受 `canEdit` 限制。服務端始終重查授權。
- 每個樣本顯示「現有評判」「Jev 判斷」「兩者比較」三組結果；Jev 部分至少展示 grounding、coverage、未證實操作概率、人工覆核概率及模型版本。概率以百分比呈現，附「模型估計，需校準」說明。
- 加「評判分歧」「Jev 未完成／失敗」篩選；空值不得顯示為「一致」。
- 清楚區分「無核實來源」「Jev 未運行」「Jev 服務錯誤」「兩者意見不同」。不得因 Jev API 錯誤隱藏現有診斷和修復記錄。
- 更新 `src/lib/customer-faq.ts` 的型別和 API 包裝；沿用現有錯誤碼轉換方式。介面文案採用現有香港繁體風格。

## 9. 驗收標準

### 功能與安全

1. Feature flag 關閉或 key 缺失時，舊回放、舊 judge、`samples` 和修復流程維持原行為；不發 TypeSafe 請求。
2. 對完整 `answer_quality` run，Jev 只評估有效樣本；`routing_safety`、資料缺口、配對不確定、檢索失敗、固定 guard 阻擋的樣本跳過或標不可評估，且記錄明確原因。
3. 對同一樣本重複按按鈕、兩個工作程序並發、途中停止再續跑，不出現重複外部請求或混用不同版本的結果。
4. 模型回應少欄位、額外欄位、非法 choice、非數值或越界概率時拒絕該結果；不把失敗當成「安全／一致」。
5. 既有確定性高風險 issue 不會被 Jev 的低風險判斷清除；任何 Jev 結果都不改動 FAQ、修復提案、訂單或 WhatsApp 發送。
6. API key 只在 Supabase secrets；前端 payload、資料庫判定行、一般日誌和錯誤回應均不含 key 或未脫敏對話。

### 評估品質

準備至少 50 個**人工標註**、彼此去重的香港繁體／廣東話樣本，覆蓋：正確回覆、漏答、錯政策、引用錯誤、急單／投訴、否定句、多意圖、舊真人答案過時、無核實來源、日期及金額。人工標註須記錄依據；模型不能讀標準答案。報告 Jev 與現有 judge 各自對 `grounding` 的混淆矩陣、人工覆核命中率、分歧樣本清單、延遲及每樣本 token 用量。**通過功能驗收不等於批准 Jev 決定正式修復或即時回覆**；是否進入下一階段取決於此評估結果。

### 測試與交付

- 對 Jev adapter 使用 mock fetch 測試官方請求／回應、概率校驗、脫敏、超時及 401／422／429／529。
- 對 endpoint 使用 mock TypeSafe 回應測試權限、scope、版本、批次續跑、並發 claim、冪等、無副作用及舊 run 相容。
- 對前端測試未執行、分歧、無法比較及服務錯誤狀態；確認舊診斷仍可讀。
- 跑相關 Vitest、`npm run check:edge-functions`、`npm run build`；記錄實際命令和結果。
- 交付 migration、後端、前端、測試、`.env.example` 說明及一份短的試點評估報告模板。不得填入真實 API key。

## 10. 給 DeepSeek 的開發指令

請先讀第 2 節列出的現有程式與 `docs/customer-service-history-replay-safe-remediation.spec.md`，核對簽名、資料欄位及權限後才改碼。以本 PRD 的**獨立、按需、只供診斷**邊界完成第一期。若現有資料無法證明 FAQ 候選是已核實來源，請把該樣本標為不可評估，並在交付報告中指出缺口；不要自行假設它已獲批准。完成後提供變更檔案、實際測試結果、尚未驗證事項和啟用所需的配置步驟。不要自行部署或開啟正式環境功能。
