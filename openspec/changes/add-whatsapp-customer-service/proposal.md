## Why

客人已經用 WhatsApp `(+852) 5396 4335` 收訂單通知，但回覆查單、到會需求或政策問題時沒有系統在聽，只能等真人。現有 WATI 整合只做出站模板，自助查單要電話加電郵，官網表單才能把詢問寫成報價。需要在同一條 WhatsApp 線上接住對話：查得到單、收得到到會意見並通知同事、政策問題能搜 FAQ，危險問題轉真人。

## What Changes

- 新增 WATI 入站 webhook 與 24 小時服務窗內的 session 自由回覆；客服 bot 使用獨立殺開關，不與現有自動／手動通知開關綁死。
- 以 WhatsApp 電話對 `orders` 快照聯絡電話查正式訂單；對上一張直接回狀態與加單連結，對上多張列出訂單號讓客人選，不再追問電郵。
- 完全沒單的新客，或只有未轉正式單的報價，改走蒐集到會意見：日期、人數、預算、忌口、菜式。寫成 `source_system = 'whatsapp'` 的待跟進報價，並通知內部同事。
- 新增可後台維護的 FAQ 資料表，以關鍵字／模糊比對搜尋政策（加單截止、自取、惡劣天氣等）；第一版不上向量檢索。
- 改期、取消、投訴、議價、付款爭議一律停 bot、轉真人；機器人不得改單、不得報死價、不得當場推套餐。
- 第一版不建 FCCD 客服工作台（沿用 WATI inbox）、不做網站／Email 客服、不做食物或套餐推薦。

## Capabilities

### New Capabilities

- `whatsapp-customer-service`: 定義客人經 WhatsApp 查單、蒐集到會意見並通知同事、搜 FAQ、以及危險問題轉真人的行為與安全邊界。

### Modified Capabilities

無。現有 `openspec/specs/` 沒有已發布的主規格；本期不改供應商報價識別或其他已歸檔能力的需求。

## Impact

- 後端：新增入站 Edge Function（WATI webhook 驗簽、意圖分流、查單／FAQ／報價寫入、session 回覆）；複用自助查單 RPC 的讀取邊界與電話正規化；沿用 EmailMeForm 寫入待跟進報價的形狀並加上來源標記。
- 資料庫：FAQ 表與維護權限；客服對話／入站事件紀錄；報價 `source_system` 增加 `whatsapp`；內部同事通知沿用現有 Email／WATI 內部通道。
- 前端：FAQ 維護頁（類似字典配置）；報價跟進佇列需能辨識 WhatsApp 來源。第一版不新增客人對話 UI。
- 外部：WATI 入站 webhook 與 session message API；現有出站模板流程保持獨立，需避免與 bot 雙重回覆。
- 測試：webhook 驗簽與冪等、電話對單（零／一／多張）、意見寫入與內部通知、FAQ 搜尋、轉真人規則、殺開關。
