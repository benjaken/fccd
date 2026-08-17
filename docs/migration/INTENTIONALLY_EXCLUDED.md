# Intentionally excluded Bubble data

This list is the migration policy as of 2026-08-17. `Login_code` is no longer excluded.

## Now migrated (was excluded)

- `DS_Super_Motorcade.Login_code` → `delivery_teams.login_code` (verbatim). Authenticated API clients cannot SELECT/INSERT/UPDATE this column; service role and driver login use it. Two teams currently have an empty Bubble `Login_code` and remain null.

## Still excluded on purpose

| 項目 | 原因 |
|---|---|
| Bubble `User.pw` | 永不遷移密碼雜湊／明文 |
| `DS_Super_Motorcade.driver_panel` | 車隊主檔未建對應欄位 |
| `DS_Super_Motorcade.payment method(text)` | 車隊主檔未建對應欄位 |
| `A_Customers` → `customers` | 歷史 Phase B 明確導入 0 列 |
| `quote_file` 二進位 | 改走 File Manager → `attachments`；只遷 722 筆 metadata |
| `a_products_backfill` / `a_orders_backfill` | 歷史 UPDATE，增量改為只插入不覆蓋 |
| `shop_ds_holiday` / `shop_ds_staff_list` / `shop_ds_time_slot` / `shop_roster` | 來源 0 列，未建映射 |
| Workflows / Privacy Rules | Bubble 無 API |
| Option Sets 資料 | Schema 就緒，資料 0 / 35 |
| `Announcement` / `MM_Products` / `DS_driver Assign Remind` / `Font` | Production Data API 不可用 |
| 已存在 `legacy_id` 的增量列 | 衝突不覆蓋（開發中資料） |
| 54 條無法下載的 CSV 附件 | 已標記 `excluded` |
| 增量衝突列上的 Bubble 後續修改 | 上線前若要對齊需另做覆蓋式同步 |

Editor `User` 帳號改採用既有 `auth.users` + `user_profiles`（24 個），不是 Bubble 密碼。
