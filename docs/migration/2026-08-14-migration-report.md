# 2026-08-14 Bubble → Supabase 遷移報告

核實時間：`2026-08-14T01:30:00Z`（約 09:30 HKT）  
目標：Supabase `main`（`vignxasvlxqnyvuhtjlu`）  
來源：Production Bubble Data API  
基準快照：`2026-08-12T02:39:34.000Z`（98 類型、377,116 筆）

本報告只含聚合數字與狀態，不含原始業務記錄、Token 或檔案內容。

## 1. 執行摘要

基準全量遷移（A–E、S1–S3）已完成。每日增量已改到 **23:00 HKT**，昨晚是新時刻的第一次正式跑。Phase E 當時因 Edge Runtime 503 失敗，已於今日 09:29 HKT 補跑成功。

附件已從 Bubble File Manager 清單遷移到私有 Storage；54 條無法下載的 CSV 已標記捨棄。

| 項目 | 狀態 |
|---|---|
| 98 個 Data API 類型基準導入 | 完成 |
| UUID 主鍵 / `legacy_id` 唯一 | 抽樣表全部列數 = distinct `legacy_id` |
| 每日增量（append-only，衝突不覆蓋） | 已生效；91 個 source type 有 checkpoint |
| 附件二進位 | 4,147 已核實；54 CSV 已排除 |
| Option Sets | Schema 就緒；資料 0 / 35 |
| Workflow / Privacy Rules | Bubble 無 API，仍需編輯器人工處理 |
| 切換營運來源到 Supabase | 尚未放行 |

## 2. 基準全量（2026-08-12）

| Phase | 範圍 | 基準筆數 | UUID 問題 |
|---|---|---:|---:|
| A | Lookup / Master / 車隊 | 464 | 0 |
| B | 商品 / 套餐 | 12,241 | 0 |
| C | 訂單 / 行 / 付款 / 配送 | 74,754 | 0（金額需增量對賬） |
| D1 | 食材 / BOM | 81,972 | 1 組已接受（5 行） |
| D2 | 肉類庫存 | 38,059 | 17 組已接受（18 行） |
| E | 餐廳 / 店鋪 | 127,759 | 0 |
| S1 | 剩餘 lookup / backfill | 7,536 | 0 |
| S2 | 成本 / 採購 / 結算 | 16,368 | 0 |
| S3 | 報價快照 / 標籤 / 檔案 metadata | 17,963 | 1 組已接受（1 行） |
| **合計** | | **377,116** | **19 組 / 24 行，均為 accepted** |

`data_quality_issues` 現況：19 筆，全部 `accepted`，無 open。

未走 Data API 的編輯器類型維持原決策：

- `User` → 既有 24 個 `auth.users` + `user_profiles`（不遷移 `user.pw`）
- `Announcement`、`MM_Products`、`DS_driver Assign Remind`、`Font`：production API 不可用，歷史封存

增量明確不處理：`quote_file` 二進位、商品/訂單 backfill UPDATE、`shop_ds_holiday`、`shop_ds_staff_list`、`shop_ds_time_slot`、`shop_roster`（來源筆數均為 0）。

## 3. 每日增量

排程（全部 `active`，UTC `15:*` = HKT 23:00–23:18）：

| Job | Cron (UTC) | HKT | Phase |
|---|---|---|---|
| `fccd-bubble-incremental-a` | `0 15 * * *` | 23:00 | a |
| `fccd-bubble-incremental-b` | `3 15 * * *` | 23:03 | b |
| `fccd-bubble-incremental-c` | `6 15 * * *` | 23:06 | c |
| `fccd-bubble-incremental-d1` | `9 15 * * *` | 23:09 | d1 |
| `fccd-bubble-incremental-d2` | `12 15 * * *` | 23:12 | d2 |
| `fccd-bubble-incremental-e` | `15 15 * * *` | 23:15 | e |
| `fccd-bubble-incremental-remaining` | `18 15 * * *` | 23:18 | remaining |

策略：只插入新 `legacy_id`；已存在的記錄寫入 `bubble_incremental_conflicts`（`existing_legacy_id_preserved`），不覆蓋開發中資料。

### 3.1 2026-08-13 23:00 HKT 第一次新時刻執行

`pg_cron` 7/7 succeeded（只代表 `net.http_post` 已送出）。

| Phase | HTTP | 拉取 | 新增 | 衝突 |
|---|---:|---:|---:|---:|
| A | 200 | 1 | 1 | 0 |
| B | 200 | 8 | 8 | 0 |
| C | 200 | 106 | 53 | 53 |
| D1 | 200 | 37 | 37 | 0 |
| D2 | 200 | 38 | 38 | 0 |
| E | **503** `SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED` | — | — | — |
| remaining | 200 | 46 | 46 | 0 |

當晚實際寫入約 **183** 筆新列。Phase E 未執行。

### 3.2 2026-08-14 09:29 HKT Phase E 補跑

手動以相同 Vault cron secret 呼叫 `bubble-daily-incremental`，`timeout_milliseconds=180000`。

- HTTP 200，`status=completed`，runId `219ab33b-ec10-45db-9aa5-58e994316637`
- 拉取 47 / 新增 47 / 衝突 0
- 全部為 `shop_dailysales` → `restaurant_daily_sales`

### 3.3 Checkpoint 累計（含 13 日較早一次增量）

- Checkpoint 類型：91
- 累計插入：756
- Checkpoint 上記錄的最近一次衝突：154（按 source type 覆蓋，不是歷史總和）
- `bubble_incremental_conflicts` 總列：259  
  - `2026-08-13 04:00 UTC`：206  
  - `2026-08-13 15:00 UTC`：53  
- 衝突原因全部為 `existing_legacy_id_preserved`

| Source type | 累計插入 | 最近一次衝突 |
|---|---:|---:|
| `b_product_ingredients` | 171 | 3 |
| `shop_supplier_purchase` | 150 | 0 |
| `s_order` | 134 | 49 |
| `shop_dailysales` | 94 | 0 |
| `quote_t&c` | 57 | 2 |
| `quote_bento_additionalitem` | 21 | 0 |
| `b_supplierpurchase` | 21 | 0 |
| `m_donemeat_stock` | 17 | 0 |
| `m_outdone_donemeat` | 15 | 0 |
| `a_products` | 13 | 0 |
| `b_deliveryschedule` | 12 | 17 |
| `a_order` | 11 | 35 |
| `a_label` | 10 | 0 |
| `quote_paymentmethod` | 9 | 0 |
| `quote_bento_eventpart` | 5 | 0 |
| `s_payment` | 4 | 4 |
| `m_raw_stock` | 4 | 0 |
| `s_paymentreport` | 3 | 44 |
| `m_outdone_order` | 2 | 0 |
| `b_deliveryschedule_surcharge` | 2 | 0 |
| `ds_deliverydistrict` | 1 | 0 |

其餘 checkpoint 類型窗口內無新列。Watermark 最晚為 Phase E 補跑：`2026-08-14T01:29:55.468Z`。

## 4. 目標表現況（相對 08-12 快照有增長的表）

| 目標表 | 08-12 快照 | 現況 | 增量 |
|---|---:|---:|---:|
| `order_bom_requirements` | 79,908 | 80,079 | +171 |
| `restaurant_supplier_purchases` | 24,627 | 24,777 | +150 |
| `order_lines` | 61,073 | 61,207 | +134 |
| `restaurant_daily_sales` | 77,947 | 78,041 | +94 |
| `order_terms_snapshots` | 8,070 | 8,127 | +57 |
| `order_bento_additional_items` | 2,273 | 2,294 | +21 |
| `supplier_purchases` | 9,988 | 10,009 | +21 |
| `prepared_meat_stock_movements` | 11,263 | 11,280 | +17 |
| `meat_order_lines` | 9,823 | 9,838 | +15 |
| `products` | 8,302 | 8,315 | +13 |
| `deliveries` | 3,048 | 3,060 | +12 |
| `orders` | 5,922 | 5,933 | +11 |
| `product_labels` | 7,252 | 7,262 | +10 |
| `order_payment_method_snapshots` | 2,159 | 2,168 | +9 |
| `quote` 其餘 / 肉類庫存 / 付款等 | — | — | 見 checkpoint |

抽樣核實：上列及 lookup/master 表 `rows = count(distinct legacy_id)`。`customers` 仍為 0（歷史 Phase B 明確不導入客戶列）。

Junction 現況：`raw_meat_item_suppliers` 24、`raw_meat_stock_relations` 1,230、`prepared_meat_stock_raw_sources` 1,264、`restaurant_ingredient_departments` 460、`monthly_cost_channels` 4,104、`payment_settlement_payments` 4,646、`product_collection_links` 1,280、`product_main_ingredient_links` 108、`product_special_request_links` 583。

## 5. 金額摘要（目標庫加總，非正式簽核）

| 指標 | 現況 |
|---|---|
| `orders` 筆數 | 5,933 |
| `orders.grand_total` | HKD 26,434,281.10 |
| `orders.outstanding` | HKD 7,098,557.43 |
| `orders.discount_amount` | HKD 1,120,316.90 |
| `orders.shipping_fee` | HKD 638,456.00 |
| `payments.amount` | HKD 13,990,201.62（4,715 筆） |
| `order_lines.is_void` | 349 / 61,207 |

08-12 導入時相對當時報告快照的差額（grand total HKD 1,556、運費 HKD 50）已被後續生產變更與增量插入覆蓋；**正式財務簽核仍未做**。衝突策略不會把 Bubble 上已改過的舊單覆寫進 Supabase。

## 6. 附件

來源為 File Manager 全量清單（約 4,200 條），不是 08-12 快照裡的 2,711 個欄位引用。

| 狀態 | 列數 | 說明 |
|---|---:|---|
| `verified` | 4,141 | SHA-256 核實 |
| `verified` + `source_size_corrected` | 6 | Bubble `size_number` 過期，改用實際下載位元組 |
| `excluded` + `accepted_unavailable_csv` | 54 | 已確認捨棄（CDN 403） |
| **attachments 總列** | **4,201** | |
| 唯一 `sha256` / Storage 物件 | 4,038 | 內容定址去重 |
| 已核實位元組 | 7,200,280,861 | 約 6.71 GiB |

`quote_file_metadata` 仍為 722 / 722，僅 metadata；二進位走 `attachments`。

## 7. Auth 與安全

- `auth.users` / `user_profiles`：24 / 24
- 核心表 RLS 開啟；角色讀 `app_metadata.role`
- 一次性 importer Edge Function 維持 HTTP 410
- 每日增量用 Vault `bubble_daily_cron_secret` + `x-cron-secret`
- 未導入 Bubble `Login_code`、`user.pw`

## 8. 尚未完成 / 不在範圍

1. **衝突列不上線覆蓋**：259 筆已存在 `legacy_id` 被刻意保留；上線前若要與 Bubble 完全一致，需另做覆蓋式同步。
2. **財務簽核**：目標庫金額是現況加總，未對業務公式（Void、Outstanding、Cashdollar）簽字。
3. **Option Sets**：35 套後端 schema 就緒，資料未導入。
4. **Workflow / Privacy Rules**：無 API。
5. **空表 shop 類型**：holiday / staff / time slot / roster 未映射。
6. **耐用 worker / 營運切源**：未批准。Bubble 仍是營運來源。

## 9. 建議下一步

1. 觀察今晚 23:00 HKT 七段 cron，確認 Phase E 不再 503。
2. 需要時對 `bubble_incremental_conflicts` 做上線前覆蓋計畫（現況適用開發調試，不適用最終對齊）。
3. 對訂單/付款做正式金額對賬後關閉 `reconciliation_required`。
4. 導入 Option Sets。
5. 切源前另行批准 durable handlers。
