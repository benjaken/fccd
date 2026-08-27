# 2026-07-15 後 Bubble → Supabase 全域覆蓋 Dry-run

## 範圍與時間截點

- 模式：ownership-aware reconciliation audit；沒有執行舊系統資料覆蓋。
- 已按確認清除 4 筆無引用、名稱為 `test` 的明確測試資料：2 筆 `seasonings`、2 筆 `delivery_team_drivers`。
- 起點：`2026-07-14T16:00:00.000Z`，即香港時間 2026-07-15 00:00。
- 固定 watermark：`2026-08-25T10:26:53.279Z`，即香港時間 2026-08-25 18:26:53.279。
- 日期條件：Bubble `Modified Date` 嚴格大於起點、嚴格小於 watermark。
- 盤點來源：83 個 Bubble source types；全部成功，0 個失敗。

## 全域結果

| 分類 | 筆數 |
| --- | ---: |
| Bubble 範圍內記錄 | 13,269 |
| Supabase 缺少，預計新增 | 17 |
| 存在 Bubble-owned 欄位差異 | 1,893 |
| 已一致 | 11,359 |
| 保留的新系統候選記錄 | 98 |

第一輪原始欄位差異是 2,215 筆。套用 ownership allowlist 後降至 1,893 筆；322 筆屬 Bubble 未提供或新系統／Shopify 擁有的欄位，已從正式覆蓋集合排除。

## 主要差異來源

| Bubble source | Supabase table | 讀取 | 預計新增 | 有差異 | 已一致 |
| --- | --- | ---: | ---: | ---: | ---: |
| `s_order` | `order_lines` | 2,355 | 0 | 990 | 1,365 |
| `a_order` | `orders` | 300 | 0 | 197 | 103 |
| `m_meatseasoning_cost` | `meat_seasoning_cost_versions` | 312 | 0 | 227 | 85 |
| `shop_dailysales` | `restaurant_daily_sales` | 1,877 | 0 | 127 | 1,750 |
| `s_payment` | `payments` | 283 | 0 | 112 | 171 |
| `b_deliveryschedule` | `deliveries` | 173 | 1 | 55 | 117 |
| `a_products` | `products` | 474 | 0 | 54 | 420 |
| `b_product_ingredients` | `order_bom_requirements` | 2,684 | 1 | 44 | 2,639 |
| `shop_monthly_cost` | `restaurant_monthly_costs` | 26 | 0 | 26 | 0 |
| `m_seasoning` | `seasonings` | 30 | 0 | 21 | 9 |
| `m_monthly_meatprice` | `meat_price_versions` | 12 | 0 | 12 | 0 |

17 筆預計新增主要由 9 筆報價條款 snapshot、6 筆付款方式 snapshot、1 筆 delivery、1 筆 BOM requirement 組成。

## 高風險交易來源 ownership 核對

- `a_order`：300 筆中 197 筆需要更新；主要為 factory date／print state、sent-to-factory、Bubble creator、quote/order snapshot。已排除 `delivery_status`，並保留已連結 Shopify 訂單的 Shopify identity 及 outstanding。
- `s_order`：2,355 筆中 990 筆需要更新；主要為 item order、type sort、delivery date、new quantity text、remarks 及 print/send flags。只在 Bubble 實際提供相應欄位時覆蓋。
- `s_payment`：283 筆中 112 筆需要補回 `order_number_snapshot`；金額及其他欄位一致。
- `b_deliveryschedule`：173 筆中新增 1 筆、更新 55 筆；差異主要是 53 筆 driver confirmation status。新系統 `delivery_status` 不覆蓋。
- `m_raw_stock`：40 筆中只有 1 筆 inbound total amount 差異。
- `m_donemeat_stock`：197 筆全部一致。

## 保留的新系統 98 筆候選

| Table | 筆數 | 判定 |
| --- | ---: | --- |
| `order_lines` | 86 | Shopify option/drink/utensil、web quote/order lines；屬新系統流程，不可批量刪除 |
| `deliveries` | 6 | `web-delivery` / `web-order-delivery`；需保留並核對所屬訂單 |
| `delivery_surcharges` | 3 | `driver-portal` 建立；需核對是否測試操作 |
| `orders` | 1 | web quote `FCBQ20260834`；看似正式流程，先保留 |
| `payment_settlements` | 1 | manual reconciliation，金額 HKD 850；需財務確認 |
| `restaurant_new_products` | 1 | `[晚餐]清湯蘿蔔牛腩`；看似正式主檔，先保留 |

上述 98 筆全部保留。已刪除的 4 筆 `test` 記錄在刪除前確認沒有成本版本或 delivery 引用。

## 建議正式執行規則

1. 先建立 Supabase point-in-time backup，固定正式 apply watermark。
2. 啟用短暫維護模式，避免 Bubble、Shopify、web editor 同時寫入。
3. 主檔先覆蓋 Bubble-owned 欄位；保留 Supabase UUID、權限、archive 狀態及新系統專用欄位。
4. 依 phase `a → b → c → d1 → d2 → e → remaining` 處理父表，再重建 junction tables。
5. 訂單保留 Shopify identity、payment source、factory/system workflow 狀態；只覆蓋 Bubble 明確提供且由 Bubble 擁有的欄位。
6. 不以 `bubble_created_at is null` 作刪除條件；只刪除逐筆確認的測試記錄。
7. apply 後以同一 watermark 重跑 audit，要求新增／差異歸零，並核對訂單金額、付款、delivery、凍貨結餘及 orphan FK。

## 決策閘門

- Gate A：4 筆名稱為 `test` 的明確測試記錄已刪除。
- Gate B：確認 3 筆 driver portal surcharge 是否為測試操作。
- Gate C：財務確認 HKD 850 manual reconciliation 是否保留。
- Gate D：source-owned field allowlist 已完成；正式 apply 集合為新增 17 筆、更新 1,893 筆。
