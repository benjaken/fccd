## Why

客人 WhatsApp 查單時，bot 目前一次列出電話下所有訂單（包括已送達、已取消），只顯示單號與送貨日期，客人難以分辨邊張打邊張，亦要自己抄單號回覆。查單／改單應該先判斷每張訂單狀態，再按狀態篩選並標示，最後才讓客人揀單。

## What Changes

- 新增訂單狀態粗粒度分類：`處理中`／`已完成`／`已取消`（由 `delivery_status` 收斂；未知或空狀態視為處理中，避免漏單）。
- 查單（lookup）多過一張單時，**只列處理中訂單**，逐張標示粗粒度狀態並編號；已送達／已取消不再出現在可選清單。
- 若電話只有已送達／已取消紀錄，不再列出清單，改回覆「暫時冇處理中訂單」並提示可用單號查舊單或轉人工。
- 改單／轉人工（handoff）沿用「只列未送貨（處理中）訂單」並加上粗粒度狀態。
- 正式 WhatsApp 用 WATI interactive buttons 提供最多 3 個訂單選擇（button 文字為訂單號）；超過 3 張時其餘仍以文字清單列出，客人可照樣回覆單號。
- 後台客服 FAQ 預覽對話同步顯示可點擊訂單選擇（點擊等同回覆該訂單號），並回傳結構化 `orderChoices`。

## Capabilities

### New Capabilities

- `order-status-aware-selection`: 定義查單／改單時按訂單狀態先過濾再讓客人選擇的行為、粗粒度狀態標籤、互動按鈕與預覽呈現。

### Modified Capabilities

無。既有 `whatsapp-customer-service` 尚在 `add-whatsapp-customer-service` 變更中未歸檔；本期以獨立能力描述，不重寫該變更。

## Impact

- 後端：`customer-service-intents` 新增狀態分類；`customer-service-replies` 清單回覆加狀態與編號、新增訂單按鈕與「無處理中訂單」文案；`customer-service-bot` 的 `replyLookup`／`replyOrderHandoff` 先過濾再列單並帶出 `orderChoices`；`wati-customer-service` 出站送互動按鈕、預覽回傳 `order_choices`。
- 前端：`customer-faq` preview client 解析 `orderChoices`；`CustomerFaqPage` 預覽氣泡下顯示可點擊訂單按鈕；新增 i18n 文案。
- 資料庫：無 migration，沿用 `customer_service_lookup_orders`。
- 測試：bot 查單／改單狀態過濾與 `orderChoices`、replies 狀態標籤與按鈕、狀態分類純函式。
