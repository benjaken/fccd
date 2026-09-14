## 1. Bot turn：相關 FAQ 挑選

- [x] 1.1 在 `BotTurn`（及必要時 preview 回傳型別）新增 `relatedFaqs?: { id: string; question: string }[]`，並在 `replyFaq` 成功回答後從同次 `searchFaqs` 結果排除來源 id、取最多 3 條；用 unit test 覆蓋：多命中有建議、單命中無建議、`no_faq`／handoff 無建議
- [x] 1.2 新增純函式把 `relatedFaqs` 格式化為香港繁體「你可能仲想問」編號清單；正式 WhatsApp 出站在 FAQ 成功回覆時 append 該區塊，preview 路徑保留結構化欄位且正文可不重複清單；用測試鎖定格式與「無建議不加尾段」

## 2. Preview API 與前端一鍵送出

- [x] 2.1 讓 `wati-customer-service` preview 模式與 `previewCustomerServiceTurn` 回傳 `relatedFaqs`；用既有 preview handler／client 測試或擴充斷言確認欄位存在
- [x] 2.2 在 `CustomerFaqPage` 抽出 `sendPreviewText(text)`（form submit 與建議列共用），assistant 氣泡下方渲染可點擊相關題；點擊填入並自動送出；`previewing` 時禁用；加 component／行為測試覆蓋點擊送出與送出中不可再點

## 3. 驗證與收尾

- [x] 3.1 跑受影響測試（如 `customer-service-bot`、preview handler、CustomerFaq 相關 test）與 `npm run check:edge-functions`（或等價 tsc check）確認通過
- [ ] 3.2 （可選）若同次 hits 不足 3 條，用同 `category` 已發布 FAQ 補齊並加測試；不做亦不阻礙合併
