## Purpose

After the customer-service bot successfully answers a published FAQ, surface a small set of related FAQ questions so the guest can continue self-service with one tap (preview) or by replying to a short text list (WhatsApp).

## ADDED Requirements

### Requirement: FAQ 回答後提供相關問題
當系統成功用已發布 FAQ 回答客人政策問題時，系統 MUST 一併提供最多 3 條相關 FAQ 問題文字。相關條目 MUST 來自已發布 FAQ，MUST NOT 包含剛用作答覆來源的那一條，MUST NOT 杜撰未發布或內部條目。若搜尋結果沒有其他可推薦條目，系統 MUST 省略相關問題區塊，不得顯示空清單。

#### Scenario: 搜尋命中多條時回傳相關題
- **WHEN** 客人的政策問題命中至少兩條已發布 FAQ，且系統以其中一條（或以其為來源的模型改寫）成功回答
- **THEN** 系統回傳該答覆，並附上最多 3 條其他命中的問題文字作為相關建議

#### Scenario: 僅命中一條時不顯示相關題
- **WHEN** FAQ 搜尋只命中一條已發布 FAQ 且系統以此回答
- **THEN** 系統回答該 FAQ，且不附上相關問題建議

#### Scenario: 找不到 FAQ 時不顯示相關題
- **WHEN** 系統無法以已發布 FAQ 確定回答（`no_faq` 或轉真人）
- **THEN** 系統 MUST NOT 附上相關 FAQ 建議

### Requirement: 預覽對話一鍵貼上並送出
在客服 FAQ 後台預覽對話中，當一則 bot 回覆帶有相關 FAQ 建議時，系統 MUST 在該回覆下方顯示可點擊的建議列。使用者點擊某一建議時，系統 MUST 把該問題文字填入對話輸入框並自動送出，行為等同使用者手動輸入後按送出。

#### Scenario: 點擊相關題自動送出
- **WHEN** 預覽對話中 bot 回覆下方顯示相關 FAQ 建議，且使用者點擊其中一條
- **THEN** 該問題出現為下一則使用者訊息，並觸發一次 preview turn，無需再按送出

#### Scenario: 送出進行中不可重複觸發
- **WHEN** 預覽對話正在處理上一則訊息（送出中）
- **THEN** 相關建議點擊 MUST NOT 再送出新的訊息

### Requirement: WhatsApp 以文字清單附上相關題
正式 WhatsApp FAQ 回覆若有相關建議，系統 MUST 在答覆正文後附加香港繁體「你可能仲想問」文字區塊，以編號列出相關問題。本期 MUST NOT 依賴 interactive buttons 或 list message。客人其後以一般文字回覆（含編號或完整問題）時，系統 MUST 按既有 FAQ／意圖流程處理，不得因建議清單而改寫轉真人或拒答規則。

#### Scenario: 正式回覆附編號建議
- **WHEN** 正式 WhatsApp 管道成功回答 FAQ 且有至少一條相關建議
- **THEN** 出站訊息在答覆後包含「你可能仲想問」及編號問題清單

#### Scenario: 真人接管期間不推相關題
- **WHEN** 對話狀態為 `human_owned` 或 bot 本回合不回覆（`reply` 為空）
- **THEN** 系統 MUST NOT 送出相關 FAQ 建議
