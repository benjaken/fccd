# 功能目錄

這份目錄以「功能」而非檔案為單位。每張卡片把使用者目的、入口、主要規則、資料、權限、副作用和測試證據連起來；完整 route 宣告、module import、資料呼叫和測試檔案則在 [generated/index.json](generated/index.json)。

## 卡片字段補充：角色與狀態

以下補足每張功能卡片的 actors 与 states；表中角色是程式與既有 permission rows 可見的操作面，未被 DB rows 完整證明的項目仍以 `需核對` 標記。

| 功能 ID | Actors | States / transitions |
| --- | --- | --- |
| F-PLATFORM-001 | anonymous、authenticated user | signed out → session loading → profile loaded／profile error → signed in／signed out |
| F-PLATFORM-002 | Admin、Factory、Shop manager、Accounting（依 page access） | queue item pending → opened → resolved／仍待處理 |
| F-ORDER-001 | Admin、Factory、Shop manager、Accounting（依 page access） | order／delivery status filter → list loaded → detail／queue action |
| F-ORDER-002 | Admin、具 orders create／edit permission 的操作人 | draft → saved order → updated／voided line or payment → factory／delivery follow-up |
| F-QUOTE-001 | Admin、Shop manager、具 quotes permission 的操作人 | quote draft → unconfirmed／pending follow-up → confirmed／sent → order workflow |
| F-QUOTE-002 | Admin、Accounting、具 export／attachment access 的操作人 | file draft → uploaded → signed URL preview → archived／removed metadata |
| F-PRODUCT-001 | Admin、具 product edit permission 的操作人 | active master → edited／archived → used by quote／order catalog |
| F-PRODUCT-002 | Admin、Kitchen／Factory、具 supplier／ingredient permission 的操作人 | active supplier／ingredient → linked → purchase／cost entry → archived |
| F-FROZEN-001 | Admin、Factory、具 raw inventory action 的操作人 | item active → stock-in movement → edited remark／flag → report history |
| F-FROZEN-002 | Factory、Admin、具 prepared meat action 的操作人 | prepared item → inbound／outbound／both／none → stock balance → delivery note |
| F-FROZEN-003 | Admin、Factory、Accounting（依 report／settings access） | source movement／formula → calculated cost／price → pushed version／yield error |
| F-FROZEN-004 | Admin、Factory、Accounting（依 quote page／action rows） | upload → draft／review → confirmed quote line → comparison／alert／export；扫描文件 → ocr_required |
| F-KITCHEN-001 | Factory、Kitchen、Admin | order pending → in progress → complete → picked／cost input saved |
| F-FACTORY-001 | Factory、Admin、QZ printer adapter | delivery eligible → grouped → print pending → printed／needs reprint |
| F-DELIVERY-001 | Admin、Factory、具 delivery assign／fleet permission 的操作人 | pending → assigned fleet → dispatched／cancelled → delivered |
| F-DELIVERY-002 | Driver、dispatcher／Admin（driver token actions） | token absent → logged in → available → accepted → picked up → delivered／rejected |
| F-RESTAURANT-001 | Shop manager、Accounting、Admin | master selected → daily／monthly record draft → saved → updated／deleted |
| F-RESTAURANT-002 | Admin、Accounting、Shop manager（依 settings rows） | configuration active → edited／archived；expense → P&L pending／marked |
| F-REPORT-001 | Admin、Accounting、Factory、Shop manager（依 report access） | filters chosen → RPC query → aggregate rendered → CSV／PDF export |
| F-MIGRATION-001 | Super Admin、migration operator | scanning → fetched → relationships analyzing → imported／failed／checkpointed |
| F-ADMIN-001 | Super Admin、Admin | page／role config → permission assigned → access／manage；login event → logged |

## F-PLATFORM：平台基礎

### F-PLATFORM-001 登入、使用者身分與工作區

- 目的：建立 Supabase session，載入 `user_profiles`，依 role 決定一般工作區及獨立工場／司機／客戶／migration 入口。
- 入口：`/`、`/profile`、`/factory/*`、`/driver-delivery/*`、`/customer/*`、`/migration/*`。
- 邏輯：`AuthProvider` 負責 session 監聽、profile 載入、登入／登出／重設密碼及 login event；未配置 Supabase 時停在本地配置狀態。
- 資料／副作用：`auth` session、`user_profiles`、`login_logs`；工場等入口各自包住 `AuthProvider`。
- 證據：E-F-PLATFORM-001=`src/auth/AuthProvider.tsx:31`、E-T-PLATFORM-001=`test/login-page.test.tsx`、E-R-PLATFORM-001=`src/App.tsx:1914`。
- 可信度：`confirmed`。

### F-PLATFORM-002 儀表板與跟進佇列

- 入口：`/`、`/follow-up`、`/orders/dashboard`。
- 邏輯：由訂單、報價、低庫存、未付款、未派車、每週盤點等資料組合工作佇列；各卡片連回具體模組。
- 證據：E-R-PLATFORM-002=`src/App.tsx:571`、E-M-PLATFORM-002=`src/lib/dashboard.ts`、E-M-PLATFORM-003=`src/lib/orders-dashboard.ts:102`。
- 可信度：`confirmed`；卡片的業務排序和部分狀態文字需以 runtime data 進一步核對。

## F-ORDER：訂單與報價生命週期

### F-ORDER-001 訂單列表、篩選、狀態佇列與詳情

- 入口：`/orders`、`/orders/pending`、`/orders/unpaid`、`/orders/delivered-unpaid`、`/orders/monthly`、`/orders/split`、`/orders/kitchen-notes`、`/orders/reschedule-pending`、`/orders/shopify-pending`、`/orders/not-sent-factory`、`/orders/:id`。
- 邏輯：`orders.ts` 把 delivery status、order status、付款及特殊 queue 合併成 operational status；列表支援分頁／搜尋／日期／狀態，詳情再載入 line、delivery、payment、timeline、terms snapshot 和 quote files。
- 資料：`orders`、`order_lines`、`deliveries`、`payments`、`order_statuses`、`order_timeline_entries`、`order_terms_snapshots`、`quote_file_metadata`。
- 證據：E-R-ORDER-001=`src/App.tsx:578`、E-M-ORDER-001=`src/lib/orders.ts:56`、E-M-ORDER-002=`src/lib/order-details.ts:139`、E-D-ORDER-001=`supabase/migrations/20260812032618_create_core_catering_schema.sql:225`。
- 可信度：`confirmed`；實際資料庫名稱的完整 lineage 以 generated index 與 migration 索引為準。

### F-ORDER-002 建立／編輯／複製正式訂單

- 入口：`/orders/new`、`/orders/:id/edit`、付款／收據／發票子頁。
- 邏輯：先平行載入 channels、shipping methods、districts、sales partners、payment methods、products、packages；編輯時載入 order snapshot、active lines、payments、delivery；儲存時更新／新增 order，void 移除 lines／payments，upsert active lines／payments／delivery。
- 不變條件：訂單 line 和 payment 以 snapshot 保存；payment 移除採 voided timestamp；正式 order 的 outstanding 由 payment 合計重算。
- 資料／副作用：`orders`、`order_lines`、`payments`、`deliveries`；可能觸發工場列印狀態和物流資訊。
- 證據：E-M-ORDER-003=`src/lib/order-editor.ts:121`、E-M-ORDER-004=`src/lib/order-editor.ts:322`、E-T-ORDER-001=`test/order-editor.test.ts`。
- 可信度：`confirmed`。

### F-QUOTE-001 報價建立、跟進與轉正式訂單

- 入口：`/quotes`、`/quotes/high-chance`、`/quotes/large`、`/quotes/follow-up`、`/quotes/pending`、`/quotes/upcoming`、`/quotes/new`、`/quotes/:id/edit`、`/quotes/:id/pdf`。
- 邏輯：quote 與 unconfirmed order 共用 `orders` 主體；建立／複製透過 RPC，再寫入 quote workflow 欄位；編輯載入客戶、delivery、tags、付款及 channel，報價確認可發送通知。
- 資料／副作用：`orders`（document type quote／unconfirmed）、`quote_*` 設定及 PDF metadata/pages、`deliveries`、`payments`、`order_tag_assignments`；`send-quote-confirmation` 對外發送 WATI／email。
- 證據：E-R-QUOTE-001=`src/App.tsx:731`、E-M-QUOTE-001=`src/lib/quote-editor.ts:121`、E-M-QUOTE-002=`src/lib/quote-editor.ts:154`、E-I-QUOTE-001=`supabase/functions/send-quote-confirmation/index.ts:1`。
- 可信度：`confirmed`。

### F-QUOTE-002 報價文件、PDF 頁面與附件

- 入口：quote detail 的 files／PDF pages、`/settings/attachments`。
- 邏輯：瀏覽器只取得 signed URL；quote files 以 bucket／metadata 管理，PDF draft／page 模組支援頁面排序、預覽和輸出。
- 資料／副作用：`quote_file_metadata`、`quote_pdf_pages`、private Storage、`attachments`；不把 private URL 當永久資料。
- 證據：E-M-QUOTE-003=`src/lib/quote-files.ts`、E-M-QUOTE-004=`src/lib/quote-pdf-pages.ts`、E-R-QUOTE-002=`src/App.tsx:757`。
- 可信度：`confirmed`。

## F-PRODUCT：產品與配方主檔

### F-PRODUCT-001 產品／套餐目錄與編輯

- 入口：`/products`、`/products/catering`、`/products/lunchbox`、`/products/ala-carte`、`/products/packages`、`/products/:id`、`/products/packages/:id` 及 edit 變體。
- 邏輯：產品依 type、collection、tag、label 和 active／archived 狀態篩選；套餐另有 package products、choice sets；detail／editor 維護價格、名稱、內容、標籤、主食材和特殊要求。
- 資料：`products`、`packages`、`package_products`、`package_choice_sets`、`product_types`、`product_collections`、`product_ingredients`、`product_labels`、`product_tags`、`product_special_request_links`。
- 證據：E-R-PRODUCT-001=`src/App.tsx:776`、E-M-PRODUCT-001=`src/lib/products.ts`、E-M-PRODUCT-002=`src/lib/packages.ts`。
- 可信度：`confirmed`。

### F-PRODUCT-002 食材與供應商主檔

- 入口：`/kitchen/ingredients`、`/kitchen/suppliers`。
- 邏輯：食材依 ingredient／packing 類型、unit、stocktake unit、active 狀態及 supplier 關聯管理；supplier records 另提供供應商月度費用及成本輸入。
- 資料：`ingredients`、`suppliers`、`supplier_purchases`、`supplier_cost_categories`、restaurant／kitchen supplier records。
- 證據：E-R-PRODUCT-003=`src/App.tsx:921`、E-M-PRODUCT-003=`src/lib/ingredients.ts`、E-M-PRODUCT-004=`src/lib/kitchen-supplier-records.ts`。
- 可信度：`confirmed`。

## F-FROZEN：凍貨、凍肉與供應商報價

### F-FROZEN-001 生肉庫存與入貨

- 入口：`/frozen/raw-meat-inventory`、凍肉相關報表 tab。
- 邏輯：以 raw meat item、supplier、movement date、weight unit conversion 和 stock-in RPC 保存實際入貨；畫面提供 item／supplier／year／month 篩選及 remark／flags 編輯。
- 資料：`raw_meat_items`、`raw_meat_item_suppliers`、`raw_meat_stock_movements`、`meat_unit_conversions`、`raw_meat_stock_relations`。
- 證據：E-R-FROZEN-001=`src/App.tsx:814`、E-M-FROZEN-001=`src/lib/raw-meat-inventory.ts:93`、E-D-FROZEN-001=`supabase/migrations/20260820210000_frozen_supplier_quote_data_model.sql:119`。
- 可信度：`confirmed`。

### F-FROZEN-002 製成品庫存、生產出貨與凍肉單據

- 入口：`/frozen/prepared-meat-inventory`、`/frozen/delivery-notes`、`/frozen/customers`。
- 邏輯：prepared meat 與 raw meat 可有 inbound／outbound／both／none movement；outbound 可直接出 raw meat 或由 raw source 關聯；meat orders 產生 delivery note，並以 customer／shipping method／pack yield 規則限制操作。
- 資料：`prepared_meat_items`、`prepared_meat_stock_movements`、`prepared_meat_stock_raw_sources`、`meat_orders`、`meat_order_lines`、`meat_customers`、`meat_shipping_methods`。
- 證據：E-R-FROZEN-002=`src/App.tsx:818`、E-M-FROZEN-002=`src/lib/prepared-meat-inventory.ts:74`、E-M-FROZEN-003=`src/lib/meat-delivery-notes.ts:60`。
- 可信度：`confirmed`。

### F-FROZEN-003 售價成本、香料及產量異常

- 入口：`/frozen/selling-price-cost`、`/frozen/seasoning-recipes`、`/frozen/seasoning-cost`、`/frozen/spice-usage`、`/frozen/yield-errors`、`/frozen/calculation-settings`。
- 邏輯：以 raw／prepared stock relation、月度價格版本、seasoning expression、yield formula 和 threshold 計算售價／成本；yield deviation 達 threshold 才產生 error record；設定頁控制 calculation constants。
- 資料：`meat_price_versions`、`meat_seasoning_cost_versions`、`seasonings`、`meat_yield_errors`、`meat_calculation_settings` 及 raw／prepared movement。
- 證據：E-R-FROZEN-003=`src/App.tsx:822`、E-M-FROZEN-004=`src/lib/selling-price-cost.ts:152`、E-M-FROZEN-005=`src/lib/meat-yield.ts:40`。
- 可信度：`confirmed`。

### F-FROZEN-004 供應商 PDF 報價分析

- 入口：`/frozen/supplier-quotes`。
- 邏輯：上傳 private PDF → Edge Function 文字抽取／候選識別 → 人工選取與商品對應 → quote line confirmed → 依 supplier／item／spec／unit 比較基準、上一筆、最新價格，並產生 threshold alert／CSV／列印報告。
- 資料：`supplier_quote_documents`、`supplier_quote_lines`、`supplier_quote_profiles`、`supplier_quote_aliases`、`supplier_quote_conditions`、`supplier_quote_thresholds`、`supplier_quote_alerts`；與 `raw_meat_items`、actual inbound price history 分開。
- 權限：`frozen.supplier_quotes`、`.upload`、`.review`、`.export`、`.settings`。
- 證據：E-R-FROZEN-004=`src/App.tsx:850`、E-M-FROZEN-006=`src/lib/supplier-quote-api.ts:252`、E-I-FROZEN-001=`supabase/functions/supplier-quote-ingest/index.ts:1`、E-I-FROZEN-002=`supabase/functions/_shared/supplier-quote-recognition.ts:439`、E-D-FROZEN-002=`supabase/migrations/20260820210000_frozen_supplier_quote_data_model.sql:73`、E-D-FROZEN-003=`supabase/migrations/20260822230000_improve_frozen_supplier_pdf_recognition.sql:32`。
- 可信度：`confirmed`（目前工作樹 source）；parse run／IR／AI adapter 已有程式與 migration，部署環境是否已套用需另行確認，AI／OCR 範圍另見既有 PRD 和凍貨報價 change。

## F-KITCHEN：中央廚房與生產

### F-KITCHEN-001 廚房訂單、日曆與成本輸入

- 入口：`/kitchen`、`/kitchen/calendar`、`/kitchen/cost-input`、`/kitchen/material-usage`、`/kitchen/settings`。
- 邏輯：由 order／delivery／factory 狀態組合廚房 operational status；calendar 以香港日期分組，展示待生產、製作中、完成及執貨；cost input 維護廚房成本與 supplier records；material usage 按 production consumption 彙總。
- 資料／證據：E-R-KITCHEN-001=`src/App.tsx:854`、E-M-KITCHEN-001=`src/lib/kitchen-orders.ts`、E-M-KITCHEN-002=`src/lib/kitchen-calendar.ts:287`、E-M-KITCHEN-003=`src/lib/kitchen-cost-input.ts`。
- 可信度：`confirmed`。

### F-FACTORY-001 工場訂單、出產日曆與列印

- 入口：`/factory`、`/factory/order/:deliveryId`、`/factory/production-calendar`、`/factory/multi-day-menu`、`/factory/meat-delivery-note/:meatOrderId`。
- 邏輯：factory board 先從 deliveries／meat orders 篩選 eligible items，按日期／fleet／brand 聚合；order job 管理 line print state；QZ adapter 取得 label command，列印完成狀態回寫 RPC。
- 資料／副作用：`orders`、`deliveries`、`meat_orders`、factory print state、QZ Tray。
- 證據：E-R-FACTORY-001=`src/App.tsx:1946`、E-M-FACTORY-001=`src/lib/factory-board.ts:301`、E-M-FACTORY-002=`src/lib/factory-label.ts:15`、E-I-FACTORY-001=`supabase/functions/qz-label-tspl/index.ts:1`。
- 可信度：`confirmed`。

## F-DELIVERY：配送與司機

### F-DELIVERY-001 後台配送列表與派車

- 入口：`/delivery`、`/delivery/assign`、`/delivery/fleets`、訂單 drivers／delivery tabs。
- 邏輯：配送列表按日期、搜尋、fleet、shipping method 分頁；assignment options 來源為 delivery teams；assign／cancel 由 RPC 保護狀態；fleet settings 管理車隊。
- 資料：`deliveries`、`delivery_teams`、`delivery_team_drivers`、`shipping_methods`、`delivery_districts`、surcharges。
- 證據：E-R-DELIVERY-001=`src/App.tsx:867`、E-M-DELIVERY-001=`src/lib/deliveries.ts:429`、E-M-DELIVERY-002=`src/lib/delivery-driver-assignment.ts:108`。
- 可信度：`confirmed`。

### F-DELIVERY-002 司機自助配送流程

- 入口：`/driver-delivery/*`。
- 邏輯：司機以 login code 取得 session token；以 token 讀取 available／accepted orders，依序 accept → pickup → deliver／reject；可管理 driver、fleet summary、surcharge、收入及配送照片。
- 資料／副作用：driver delivery RPC family、private delivery file proxy；瀏覽器不持有 Supabase service role。
- 證據：E-R-DELIVERY-002=`src/App.tsx:1962`、E-M-DELIVERY-003=`src/lib/driver-delivery.ts:84`、E-I-DELIVERY-001=`supabase/functions/driver-delivery-files/index.ts:1`。
- 可信度：`confirmed`。

## F-RESTAURANT：餐廳營運與財務輸入

### F-RESTAURANT-001 餐廳每日銷售、採購與盤點

- 入口：`/restaurant/daily-sales`、`/restaurant/daily-purchases`、`/restaurant/inventory`。
- 邏輯：先載入 restaurant、department、service period、payment method、delivery platform、supplier／purchase type master；按香港日期／月份保存每日 sales、purchase entry、stocktake，支援近期記錄和 duplicate guard。
- 資料：`restaurant_daily_sales`、`restaurant_supplier_purchases`、`restaurant_stocktake_events`、`restaurants`、`restaurant_*` master tables。
- 證據：E-R-RESTAURANT-001=`src/App.tsx:939`、E-M-RESTAURANT-001=`src/lib/restaurant-daily-sales.ts:189`、E-M-RESTAURANT-002=`src/lib/restaurant-daily-purchases.ts:110`、E-M-RESTAURANT-003=`src/lib/restaurant-stocktakes.ts:58`。
- 可信度：`confirmed`。

### F-RESTAURANT-002 餐廳月度支出、報數、員工與設定

- 入口：`/restaurant/monthly-expenses`、`/restaurant/reports`、`/restaurant/staff`、`/restaurant/settings/*`、`/finance/cost-input`。
- 邏輯：月度 expense 以 restaurant／month／category 保存，P&L status 另行控制；staff、department、service period、payment method、platform、holiday、roster、inventory item 和 P&L category 由 settings pages 管理。
- 資料：`restaurant_monthly_costs`、`restaurant_monthly_pnl_cost_categories`、`restaurant_staff`、各 restaurant settings tables。
- 證據：E-R-RESTAURANT-002=`src/App.tsx:955`、E-M-RESTAURANT-004=`src/lib/restaurant-monthly-expenses.ts:217`、E-M-RESTAURANT-005=`src/lib/settings.ts:454`。
- 可信度：`confirmed`。

## F-REPORT：報告與分析

### F-REPORT-001 廚房、凍貨、店舖及輸入進度報告

- 入口：`/reports`、`/reports/data-input-progress`、`/reports/kitchen/*`、`/reports/frozen-meat`、`/reports/shops`、`/restaurant/reports`。
- 邏輯：報告模組多以 RPC 聚合，前端負責篩選、趨勢、CSV／PDF／列印及來源標籤；凍貨報告將 raw／prepared stock、平均價、supplier purchase 分開顯示。
- 資料／證據：E-R-REPORT-001=`src/App.tsx:992`、E-M-REPORT-001=`src/lib/reports.ts:140`、E-M-REPORT-002=`src/lib/supplier-quotes.ts:864`。
- 可信度：`confirmed`。

## F-MIGRATION：Bubble migration 與系統管理

### F-MIGRATION-001 Bubble 掃描、匯入與關係分析

- 入口：`/migration/*`、migration pages／workspace。
- 邏輯：瀏覽器只透過 Edge Function proxy 取得 aggregate counts、relationship cardinality、confidence、orphan summary；分階段 migration 使用 checkpoint／phase functions，避免將 Bubble credentials 暴露給 browser。
- 資料／副作用：`bubble_incremental_checkpoints`、conflicts、migration registry、private/service-role functions。
- 證據：E-R-MIGRATION-001=`src/App.tsx:1970`、E-M-MIGRATION-001=`src/lib/bubble-api.ts:20`、E-M-MIGRATION-002=`src/lib/bubble-relations.ts:41`、E-I-MIGRATION-001=`supabase/functions/bubble-scan/index.ts:1`。
- 可信度：`confirmed`。

### F-ADMIN-001 角色、頁面權限、使用者、附件與登入紀錄

- 入口：`/settings/users`、`/settings/roles`、`/settings/login-logs`、`/settings/attachments`、`/settings/order-lists`。
- 邏輯：`SYSTEM_ROLES` 定義角色；`usePageAccess` 將 `canAccess` 和 `canManage` 分開，Super Admin 保留全權；role permission cascade 會同步父／子 page key；admin-users Edge Function 執行使用者敏感操作。
- 資料／副作用：`user_profiles`、`app_pages`、`role_page_permissions`、`login_logs`、`attachments`、private signed URL。
- 證據：E-R-ADMIN-001=`src/App.tsx:1072`、E-M-ADMIN-001=`src/auth/use-page-access.ts:288`、E-M-ADMIN-002=`src/lib/settings.ts:402`、E-I-ADMIN-001=`supabase/functions/admin-users/index.ts:1`。
- 可信度：`confirmed`。

## 入口與未分類項目

`generated/index.json` 是 route declaration 的完整底稿。它包含 nested route 及 pathname reuse，因此 177 是宣告數，不等同於 177 個獨立功能；文件中的功能卡片以可觀察的使用者能力去重。`control`、`files`、`fk`、`inventory` 等無 `/` 前綴的宣告，以及 `*` fallback，列為需進一步確認的 legacy／特殊入口，不自動歸入正式領域功能。
