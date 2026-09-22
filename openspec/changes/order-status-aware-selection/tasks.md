## 1. 狀態分類與回覆

- [x] 1.1 `customer-service-intents` 新增 `classifyCustomerServiceOrderLifecycle`、`isActiveCustomerServiceOrder`、`customerServiceOrderLifecycleLabel`（處理中／已完成／已取消；未知視為處理中）；加單元測試覆蓋取消／送達／未知／空白
- [x] 1.2 `customer-service-replies` 的 `lookupListReply` 加編號與粗粒度狀態、`handoffOrderListReply` 加粗粒度狀態、新增 `lookupNoActiveOrdersReply`；更新 `pickOrder` 文案
- [x] 1.3 新增 `buildOrderChoiceButtons`（最多 3 個、標籤＝訂單號、≤20 字）與 `CustomerServiceOrderChoice` 型別；加單元測試

## 2. Bot 流程：先判斷狀態再讓客人揀

- [x] 2.1 `BotTurn` 加 `orderChoices`；`isUndeliveredOrder` 改用 lifecycle；新增 `orderChoicesFor` 組裝
- [x] 2.2 `replyLookup`：全電話單張照舊直接回覆；多張時只列處理中；單張處理中直接回覆；只有已完成／已取消回 `lookupNoActiveOrdersReply`；列單時帶 `orderChoices`
- [x] 2.3 `replyOrderHandoff` 列單時帶 `orderChoices`
- [x] 2.4 bot 測試：多張處理中列清單＋狀態＋按鈕；已送達被排除；只有歷史訂單唔列清單；改單只列未送貨（既有測試）

## 3. WhatsApp 與預覽呈現

- [x] 3.1 `wati-customer-service` 出站以 `buildOrderChoiceButtons` 送訂單互動按鈕；按鈕優先於相關 FAQ 按鈕，失敗時相關 FAQ 才回退文字（訂單清單本身已在正文）
- [x] 3.2 preview 回應加 `order_choices`
- [x] 3.3 `src/lib/customer-faq.ts` 解析 `order_choices` 為 `orderChoices`
- [x] 3.4 `CustomerFaqPage` 預覽氣泡下顯示可點選訂單按鈕（送出訂單號）；新增 i18n `previewOrderChoicesLabel`（zh-HK／en）

## 4. 驗證

- [x] 4.1 `npm run check:edge-functions` 通過
- [x] 4.2 `npm run lint` 通過
- [x] 4.3 `npx vitest run test/customer-service-bot.test.ts test/customer-service-replies.test.ts test/customer-service-preview-handler.test.ts`（注：`records the classified intent and pilot routing for a routed turn` 為變更前已存在、與本變更無關的失敗）
