# 權限矩陣

## 控制模型

角色來源為 `src/lib/settings.ts:5` 的 `SYSTEM_ROLES`：Super Admin、Admin、Accounting、Factory、Shop manager、Customer_Main、Customer_Sub。`usePageAccess` 由 `role_page_permissions` 讀取 `can_access`／`can_manage`；Super Admin 在前端與資料庫層有保留全權。頁面入口可由 parent 或 child access 開啟，但 action 必須再檢查 action page key／RPC／RLS。

`canAccess` 是「可以看到／進入」，`canManage` 是「可以管理」。兩者不可在文件或 UI 中合併為單一布林值。

## 領域級矩陣（設計意圖與實作證據）

| 領域 | 主要 page keys | 管理／高風險 action | 角色意圖（需以 DB permission rows 驗證） | 證據 |
| --- | --- | --- | --- | --- |
| 訂單 | `orders`、`orders.*` | `orders.create`、payment／driver／settings actions | Super Admin／Admin；操作角色依 page rows | `src/auth/use-page-access.ts:17`、`src/lib/order-action-permissions.ts` |
| 報價 | `quotes`、`quotes.*` | editor、PDF pages、send／follow-up actions | Super Admin／Admin；Shop manager 依授權檢視／編輯 | `src/lib/quote-editor.ts`、`src/lib/nav.ts:228` |
| 凍貨 | `frozen.*` | raw stock-in／edit、prepared outbound、selling price push | Super Admin／Admin／Factory 按子頁和 action | `src/lib/frozen-action-permissions.ts` |
| 供應商報價 | `frozen.supplier_quotes` | `.upload`、`.review`、`.export`、`.settings` | migration 明確讓 Admin／Super Admin／Factory review；Accounting export／access 依 rows | `supabase/migrations/20260820210000_frozen_supplier_quote_data_model.sql:9`、`:31` |
| 廚房／工場 | `kitchen.*`、`factory` | ingredient、stocktake、cost、print | Factory／Admin 依 page；QZ／RPC 再限制 | `src/lib/kitchen-action-permissions.ts`、`src/lib/factory-board.ts` |
| 配送 | `delivery`、`delivery.assign`、`delivery.fleets` | assign／cancel、fleet settings | Admin／Factory／配送操作角色依授權；driver 使用 token flow | `src/lib/nav.ts:387`、`src/lib/driver-delivery.ts:84` |
| 餐廳 | `restaurant.*` | daily input、stocktake、settings | Shop manager／Admin／Accounting 依 page rows | `src/lib/restaurant-daily-sales.ts:189`、`src/lib/settings.ts:454` |
| 報告／財務 | `reports.*`、`finance.*` | export、cost input、P&L settings | Accounting／Admin／Super Admin 依 page／action rows | `src/lib/reports.ts:140` |
| 系統 | `settings.*` | users、roles、attachments、login logs | Super Admin／Admin；migration 保留 Super Admin | `src/lib/settings.ts:266`、`:376` |
| Migration | `migration.*` | scan、import、relationship analyze | Super Admin reserved；service role function 執行敏感操作 | `src/lib/bubble-api.ts:20`、`src/lib/bubble-relations.ts:41` |

## 視覺入口與 server enforcement

1. Nav 使用 permission key 隱藏／顯示入口。
2. `usePageAccess` 對 route 或 section 做 client gate，處理 legacy bookmark alias。
3. React component 依 action key 隱藏／disable 寫入按鈕。
4. Supabase RLS／RPC／Edge Function 再檢查 page access、session、token 或 server secret。
5. signed URL／proxy 控制 private file，而不是將 bucket 改為 public。

任何只在第 1–3 層存在、而 SQL／Edge Function 沒有保護的寫入，都列入 [差異與缺口](gaps-and-differences.md) 的需核對項。
