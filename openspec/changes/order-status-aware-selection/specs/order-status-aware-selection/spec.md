## Purpose

When a guest asks the WhatsApp customer-service bot about their orders, the system determines each order's coarse status first, then only offers actionable (active) orders for selection. Delivered and cancelled orders are never dumped into a selectable list, and selection is available as tappable buttons as well as a numbered text list.

## ADDED Requirements

### Requirement: 訂單狀態粗粒度分類
系統 MUST 把訂單的 `delivery_status` 收斂為三個客戶可見級別：`處理中`（active）、`已完成`（completed）、`已取消`（cancelled）。判斷取消關鍵字 MUST 優先於送達關鍵字。未知、空白或未識別的狀態 MUST 歸類為 `處理中`，不得因此把訂單隱藏。

#### Scenario: 已取消訂單歸為已取消
- **WHEN** 訂單 `delivery_status` 為「已取消」或 `Cancelled`
- **THEN** 系統分類為 `cancelled`，顯示標籤為「已取消」

#### Scenario: 已送達訂單歸為已完成
- **WHEN** 訂單 `delivery_status` 為「已送達」或 `delivered`
- **THEN** 系統分類為 `completed`，顯示標籤為「已完成」

#### Scenario: 未知狀態保守歸為處理中
- **WHEN** 訂單 `delivery_status` 為空白、`null` 或系統未識別的新字眼
- **THEN** 系統分類為 `active`，顯示標籤為「處理中」

### Requirement: 查單先判斷狀態再列可選訂單
當 guest 查詢訂單而系統在其電話號碼下找到多過一張訂單時，系統 MUST 先判斷各單狀態，只把 `處理中` 訂單放入可選清單。清單 MUST 以編號列出處理中訂單，每項 MUST 顯示訂單號、送貨日期及粗粒度狀態標籤，並 MUST NOT 顯示內部 `delivery_status` 原文或其他訂單明細（地址、菜式）。若多過一張訂單但只有一張處理中，系統 MUST 直接回覆該處理中訂單摘要而 MUST NOT 顯示選擇清單。

#### Scenario: 多張處理中訂單列出並標示
- **WHEN** 電話號碼下有多過一張 `處理中` 訂單
- **THEN** 系統回覆編號清單，每項包含訂單號、送貨日期及「處理中」，並進入等待客人選擇的狀態

#### Scenario: 已送達及已取消不列入清單
- **WHEN** 電話號碼下同時有處理中訂單與已送達／已取消訂單
- **THEN** 可選清單 MUST 只包含處理中訂單，已送達／已取消訂單 MUST NOT 出現

#### Scenario: 只有一張處理中時直接回覆
- **WHEN** 電話號碼下有多過一張訂單但只有一張為 `處理中`
- **THEN** 系統直接回覆該處理中訂單的摘要，不顯示選擇清單

### Requirement: 無處理中訂單不顯示選擇清單
當電話號碼下所有訂單均為 `已完成` 或 `已取消` 時，系統 MUST NOT 顯示可選清單，MUST 回覆提示沒有處理中訂單，並告知客人仍可傳送訂單號碼查舊單或要求客服跟進。回覆 MUST NOT 包含任何訂單號。

#### Scenario: 只有歷史訂單
- **WHEN** 電話號碼下只有已送達及／或已取消訂單
- **THEN** 系統回覆沒有處理中訂單的提示，且不回覆任何訂單號或選擇清單

### Requirement: 改單只提供可處理訂單
當 guest 要求更改訂單或轉人工處理而系統列出可選訂單時，系統 MUST 只列出 `處理中` 訂單，每項 MUST 顯示粗粒度狀態標籤。若沒有處理中訂單，系統 MUST 依既有未送貨訂單轉人工流程處理而 MUST NOT 列出已完成或已取消訂單。

#### Scenario: 改單列出處理中訂單
- **WHEN** guest 提出改單而電話號碼下有一張或多張處理中訂單
- **THEN** 系統列出處理中訂單並標示「處理中」，等待客人選擇

#### Scenario: 改單但無可處理訂單
- **WHEN** guest 提出改單而電話號碼下只有已完成／已取消訂單
- **THEN** 系統直接進入人工跟進，且不列出已完成／已取消訂單

### Requirement: 以互動按鈕提供訂單選擇
正式 WhatsApp 管道在系統列出可選訂單時，系統 MUST 以 interactive buttons 提供最多 3 個訂單選擇，按鈕文字 MUST 為訂單號。文字回覆 MUST 同時保留完整編號清單，作為超過 3 張或按鈕傳送失敗時的後備。客人點擊按鈕或回覆單號後，系統 MUST 依既有訂單號查詢流程回應。

#### Scenario: 兩張訂單出兩個按鈕
- **WHEN** 系統列出兩張處理中訂單
- **THEN** 系統傳送兩個按鈕，按鈕文字分別為該兩張訂單號，並附加編號文字清單

#### Scenario: 超過三張只出三個按鈕
- **WHEN** 系統列出多過三張處理中訂單
- **THEN** 系統最多傳送三個按鈕，文字清單仍列出全部處理中訂單

#### Scenario: 按鈕傳送失敗仍有文字清單
- **WHEN** interactive buttons 傳送失敗
- **THEN** 文字回覆中的編號清單仍然有效，客人可回覆訂單號

### Requirement: 預覽對話呈現可點選訂單
客服 FAQ 後台預覽對話中，當一則 bot 回覆帶有訂單選擇時，系統 MUST 在該回覆下方顯示可點擊的訂單按鈕。點擊 MUST 等同送出該訂單號並觸發 preview turn；送出進行中 MUST NOT 重複觸發。

#### Scenario: 點擊訂單按鈕自動送出
- **WHEN** 預覽對話 bot 回覆下方顯示訂單選擇，且使用者點擊其中一張
- **THEN** 該訂單號出現為下一則使用者訊息並觸發一次 preview turn

#### Scenario: 送出進行中不可重複觸發
- **WHEN** 預覽對話正在處理上一則訊息
- **THEN** 訂單選擇點擊 MUST NOT 再送出新的訊息
