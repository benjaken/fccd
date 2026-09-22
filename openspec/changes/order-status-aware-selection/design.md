## Context

WhatsApp 客服 bot（`wati-customer-service` → `handleCustomerServiceTurn`）收到查單意圖時走 `replyLookup`，用 `lookupOrders(phone)` 取回電話下所有訂單（`customer_service_lookup_orders`，回傳 `delivery_status` 原文）。目前多過一張單便呼叫 `lookupListReply`，只列單號與送貨日期；改單則走 `replyOrderHandoff`，已用 `isUndeliveredOrder` 過濾未送達／未取消。`add-related-faq-suggestions` 已建立 WATI interactive buttons 出站能力（`deliverWatiInteractiveButtons`，每則最多 3 個、標籤 ≤20 字），可直接重用於訂單選擇。See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- 查單與改單都先判斷訂單狀態，再讓客人揀相關（處理中）訂單。
- 用粗粒度狀態標籤（處理中／已完成／已取消）而非內部原文，避免洩漏內部狀態又足夠辨識。
- 正式 WhatsApp 提供可點擊訂單按鈕；預覽對話同步可點。
- 重用既有 lookup RPC 與 buttons adapter，零新表、零 migration。

**Non-Goals:**
- 不新增訂單狀態欄位或後台管理 UI。
- 不讓已送達／已取消訂單出現在選擇清單（客人仍可用完整單號直接查該單）。
- 不改成自取／加單等其他訂單操作流程。
- 不做訂單編號以外語意選單（例如「最近一張」）。

## Decisions

### 1. 狀態分類放 `customer-service-intents`
- **Choice:** 新增 `classifyCustomerServiceOrderLifecycle(status)` 回傳 `active | completed | cancelled`。取消關鍵字優先，其次已送達；其餘（含未知、空）一律 `active`。
- **Why:** 未知狀態保守當處理中，避免新狀態字眼令客人查唔到自己嘅單；純函式易測。
- **Alternatives:** 用 whitelist 只認處理中狀態（會漏新狀態）；顯示狀態原文（洩漏內部字眼且難辨識）。

### 2. 查單：只在多過一張時過濾
- **Choice:** `replyLookup` 先處理指定單號與對話已選訂單；否則計算 `activeOrders`：
  - 全電話只有 1 張（不論狀態）→ 直接回覆該單摘要（維持現行單張行為）。
  - 多過 1 張但只有 1 張處理中 → 直接回覆該處理中訂單。
  - 多過 1 張處理中 → 列出處理中訂單（編號＋粗狀態）並帶 `orderChoices`，狀態 `picking_order`。
  - 只有已完成／已取消 → 回 `lookupNoActiveOrdersReply`，不列清單。
- **Why:** 客人明確查單時唔會因為清單被隱藏而失去單張資訊；選擇清單則只放可操作訂單。
- **Alternatives:** 一律過濾（單張已完成都唔顯示）；一律列出（即現況，客人難揀）。

### 3. 粗粒度標籤
- **Choice:** `customerServiceOrderLifecycleLabel` → `處理中`／`已完成`／`已取消`。清單顯示 `單號（日期・處理中）`。
- **Why:** 客人識別用、唔顯示內部原文；符合現有「揀之前唔洩漏明細」測試精神（只顯示 lifecycle，不顯示地址／菜式）。
- **Alternatives:** 顯示原文（撞私隱設計）；只顯示日期（客人仍難分辨）。

### 4. 選擇方式：互動按鈕 + 文字清單並存
- **Choice:** `BotTurn` 加 `orderChoices?: { orderId, orderNumber }[]`；正式出站以 `buildOrderChoiceButtons` 送最多 3 個按鈕（標籤＝訂單號）。清單文字同時保留（>3 張或按鈕傳送失敗仍有單號可回）。按鈕被點後 WATI 回傳按鈕文字＝訂單號，走既有 `extractOrderNumber` 流程。
- **Why:** 重用已驗證 buttons adapter 與現有單號解析，無需新 payload 映射或對話候選狀態。
- **Alternatives:** 只出按鈕（>3 張無得揀、傳送失敗無 fallback）；只出文字（多一步）。
- **Risk:** 訂單號短於 20 字一般可用；過長會截斷，仍以文字清單單號為準。

### 5. 預覽同步
- **Choice:** preview API 回傳 `order_choices`；`customer-faq` client 解析為 `orderChoices`；`CustomerFaqPage` 於 assistant 氣泡下顯示可點按鈕，點擊送出該訂單號。
- **Why:** 後台測試對話與正式行為一致，方便追蹤。

## Risks / Trade-offs

- [客人想查已送回舊單] → 仍可用完整單號查；「無處理中訂單」文案已提示。
- [舊單號格式未被 `extractOrderNumber` 接受] → 按鈕文字用清單顯示嘅單號，兩者一致；若格式不支援，客人仍可從清單複製，屬既有解析範圍。
- [狀態字眼新增] → 未知狀態保守歸處理中，唔會誤藏。
- [按鈕多過 3 張] → 文字清單保留全部處理中訂單。

## Migration Plan

1. 先上 bot／replies／intents 與單元測試（無 DB 變更）。
2. 同步上 `wati-customer-service` 出站按鈕與 preview 回傳。
3. 再上前端 preview UI 與 i18n。
4. Rollback：還原 Edge Function／前端即可，無 migration。

## Open Questions

- 是否要將粗粒度標籤細分為「未派車／已派車／運送中」：本版先維持三級（處理中／已完成／已取消），有需要再擴充。
