## Context

客人政策問題已由 WhatsApp 客服 bot（`wati-customer-service` → `handleCustomerServiceTurn` → `replyFaq`）與後台 `CustomerFaqPage` preview 處理。`searchFaqs` 常回多條命中，但目前只用 `hits[0]`（或模型改寫）作答，其餘命中被丟棄。預覽有 composer＋`runPreview`；正式管道只有 WATI session 文字回覆，現有 adapter 沒有 interactive buttons。See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- 在 FAQ 成功回答的 turn 結果帶出結構化 `relatedFaqs`（id + question）。
- Preview：氣泡下建議列，點擊 = 填入 composer + 自動 `runPreview`。
- WhatsApp：把建議格式化進同一則文字回覆尾段。
- 重用既有 FAQ 搜尋結果，避免新表／向量檢索。

**Non-Goals:**
- 不做 WATI interactive buttons／list message。
- 不建客人面向的網頁聊天室。
- 不在查單、蒐集意見、拒答、轉真人、`human_owned` 回覆上掛建議。
- 不做 embedding／語意相似度；不做後台「手動綁定 related FAQ」編輯 UI（可後續加）。

## Decisions

### 1. 相關題來源：同次搜尋其餘命中為主
- **Choice:** `replyFaq` 在成功回答後，從同一次 `searchFaqs(query)` 結果排除已用來源 id，取最多 3 條的 `question`。若不足且命中條有 `category`，可再查同 category 已發布 FAQ 補滿（可選實作；最低限度是用其餘 hits）。
- **Why:** 零新依賴、與現有 trigram／關鍵字搜尋一致、延遲低。
- **Alternatives:** 向量相似度（超 scope）；後台手動 related 邊（需 schema＋維護成本）；固定熱門 FAQ（不相關）。

### 2. 資料契約：turn 結果加 `relatedFaqs`
- **Choice:** `BotTurn`／preview API 增加 `relatedFaqs?: { id: string; question: string }[]`。正式出站在組裝 `reply` 字串時 append 文字區塊；preview 保留結構化欄位給 UI，正文可不重複清單（避免氣泡內文字＋按鈕重複）。
- **Why:** Preview 需要可點擊結構；WhatsApp 只需純文字。
- **Alternatives:** 只改 reply 字串（preview 難做一鍵）；兩邊都用字串解析（脆弱）。

### 3. Preview UX：建議列在該則 assistant 氣泡下，點擊即送
- **Choice:** 訊息物件可帶 `relatedFaqs`；渲染為文字按鈕／連結列（非 card 堆疊）。`onClick` → `setPreviewQuery(question)` 後直接呼叫與 `runPreview` 相同的送出邏輯（抽出 `sendPreviewText(text)`，form submit 與建議列共用）。送出中（`previewing`）禁用點擊。
- **Why:** 完全符合「貼到對話框然後發送」；避免複製兩套 turn 呼叫。
- **Alternatives:** 只填入不送出（多一步）；點擊後當系統訊息（繞過 bot）。

### 4. WhatsApp 文字格式
- **Choice:** 固定尾段，例如：

  ```
  （FAQ 答覆正文）

  你可能仲想問：
  1. …
  2. …
  ```

  不加「回覆數字」強制協議；客人打完整問題或關鍵字即可，沿用既有分類器。
- **Why:** 無需 WATI 新 API；兼容所有 session 訊息。
- **Alternatives:** interactive reply buttons（需 adapter＋產品驗證，列為後續）。

### 5. 與模型 FAQ 答覆的關係
- **Choice:** 有 `faqSourceIds` 或至少成功產出 FAQ 答案且 hits 非空時才給相關題；來源 id 用於排除。模型答覆但 `sourceIds` 空時，排除 `hits[0]`（若曾傳入 hits）。
- **Why:** 避免在無依據回答上推廣錯誤相關題。

## Risks / Trade-offs

- [相關題不夠準] → 嚴格排除已答 id、上限 3、無命中則隱藏；後續可加 category 補齊或手動關聯。
- [WhatsApp 回覆變長] → 只在有建議時附加短清單；問題用 FAQ `question` 原文截斷過長標題（例如 40 字）可列實作細節。
- [Preview 與正式文案不一致] → 刻意為之：preview 用 chip、正式用文字；規格已分開。
- [重複觸發／連點] → `previewing` guard。

## Migration Plan

1. 先合併 bot＋API 型別與單元測試（preview／正式組裝）。
2. 再上 preview UI。
3. 正式 WhatsApp 文字尾段與 bot 同版部署；可 feature-flag 非必須（建議直接開，行為可逆：回退程式即停）。
4. Rollback：還原 Edge Function／前端即可，無 DB migration。

## Open Questions

- 同 category 補齊是否做進第一版：預設「有餘力再做」；tasks 以「其餘 hits」為必做，category 補齊為可選 task。
