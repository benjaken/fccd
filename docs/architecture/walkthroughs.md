# 代表性功能證據走讀

以下每條走讀都按照「使用者目的 → 入口 → 規則／狀態 → 資料 → 權限 → 副作用 → 測試」順序，為主要領域提供至少一條可重複的證據鏈。詳細檔案與行號見 [證據索引](evidence-index.md) 和 `generated/index.json`。

| 領域 | 使用者目的 → 入口 | 規則／狀態 → 資料 | 權限 → 副作用 → 測試證據 |
| --- | --- | --- | --- |
| 平台 | 使用者登入 → `/`／`/profile` | session／profile loading → `user_profiles`／`login_logs` | Auth context → login event；`test/login-page.test.tsx`、`test/quick-login.test.ts` |
| 訂單 | 建立／更新訂單 → `/orders/new`、`/:id/edit` | draft → saved；line／payment void vs upsert → `orders`、`order_lines`、`payments`、`deliveries` | `orders.*` → factory／delivery downstream；`test/order-editor.test.ts` |
| 報價 | 建立客戶報價 → `/quotes/new` | quote／unconfirmed → confirmed → `orders` + quote metadata | `quotes.*` → WATI／email；`test/quote-editor-page.test.tsx`、`test/quotes-fetch.test.ts` |
| 產品 | 編輯產品／套餐 → `/products/*` | active／archived master → product／package relation tables | product edit → quote／order catalog；`test/products-sku-filter.test.ts`、`test/products-packages.test.tsx` |
| 凍貨 | 實際入貨 → `/frozen/raw-meat-inventory` | unit conversion → raw movement → prepared relation → `raw_meat_*`／`prepared_meat_*` | frozen stock actions → cost／report；`test/raw-meat-inventory-balance.test.ts`、`test/prepared-meat-inventory-balance.test.ts` |
| 供應商報價 | 導入 PDF → `/frozen/supplier-quotes` | upload → review → confirmed／parse_failed → quote documents／lines | upload／review／export → private Storage／report；`test/supplier-quotes.test.ts` |
| 廚房／工場 | 安排生產／列印 → `/kitchen`、`/factory` | pending → in progress → complete／printed → order／delivery view | kitchen／factory page → QZ label；`test/factory-board.test.ts` |
| 配送 | 派車與完成配送 → `/delivery` | pending → assigned → delivered／cancelled → `deliveries` | delivery action → driver app／photos；`test/delivery-list.test.tsx`、`test/driver-delivery.test.tsx` |
| 餐廳 | 輸入每日營運 → `/restaurant/daily-sales` | draft → saved／updated → restaurant daily tables | restaurant daily access → reports；`test/restaurant-daily-sales.test.tsx` |
| 報告 | 查看／匯出分析 → `/reports/*` | filters → RPC aggregate → CSV／PDF | report access／export → read-only report output；`test/reports-page.test.tsx`、`test/restaurant-sales-report.test.ts` |
| Migration | 掃描／匯入 Bubble → `/migration/*` | scanning → fetched → relationship／checkpoint → imported／failed | Super Admin／server proxy → migration tables；`test/migration-workspace.test.tsx`、`test/bubble-daily-incremental.test.ts` |

若代表測試檔名在某分支不存在，該格應改為 generated index 的實際 test evidence 並標成 `openGaps`，不能以預期檔名代替事實。
