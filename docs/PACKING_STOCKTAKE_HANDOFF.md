# 包裝盤點記錄：Supabase 交接指引

本文件供後續 AI 或開發者在可編輯 Supabase 時完成「包裝盤點記錄」及「食材盤點記錄」功能的部署與驗收。

## 現在已完成（本地 `develop`）

- 中央廚房二級選單新增「包裝盤點記錄」：`/kitchen/packing-stocktakes`。
- 中央廚房二級選單新增「食材盤點記錄」：`/kitchen/ingredient-stocktakes`；兩頁使用同一套前端表格、日期建立、直接改數量及列印實作。
- 使用既有 `ListTable`、搜尋、下拉重新整理及分頁元件。
- 「新增盤點記錄」流程：選擇日期 → 檢查可盤點包裝用品 → 建立該日期尚未存在的項目 → 顯示該日期列表。
- 盤點數量直接點擊輸入，按 Enter 或離開欄位即儲存；沒有「編輯」按鈕。
- 「列印盤點紙」會先載入所選日期的全部盤點項目（不受列表分頁限制），顯示 A4 預覽，確認後開啟瀏覽器列印對話框；紙本數量欄留白供現場填寫。
- 左側日期清單會顯示最近編輯時間；有刪除權限的角色可刪除整個日期的盤點記錄，操作前必須確認。
- 前端、RLS、RPC 與 UI 測試均已在工作區建立，尚未部署到 Supabase。

## 必須執行的 Supabase 操作

1. 先確認目前目標是正確的 `develop` Supabase 專案／分支，避免誤套用到 production。
2. 套用 migration：

   `supabase/migrations/20260818170000_packing_stocktake_records_page.sql`

3. 確認 migration 成功建立：

   - `app_pages`：`kitchen.packing_stocktakes`、`kitchen.packing_stocktakes.edit`、`kitchen.ingredient_stocktakes`、`kitchen.ingredient_stocktakes.edit`
   - 對應 `role_page_permissions`
   - `packing_stocktake_events` 的讀取與更新 RLS policy
   - `create_packing_stocktake(date)`、`create_ingredient_stocktake(date)` RPC，且只有 `authenticated` 可執行

不要在前端環境變數或 Git 中加入 Supabase `service_role`、資料庫密碼或其他 secret。

## 業務驗收

以有對應 `.edit` 權限的 Factory、Admin 或 Super Admin 帳號，分別測試包裝與食材盤點頁：

1. 開啟「中央廚房 → 包裝盤點記錄」。
2. 點「新增盤點記錄」，選擇一個尚未建立盤點的日期，點「下一步」。
3. 預期：只為 `ingredients.is_packing_stocktake = true`、啟用、未封存的項目建立資料；新表只顯示所選日期。
4. 同日期再次執行：不應重複建立同一食材的盤點行；若全部已建立，應顯示「這個日期沒有可新增的包裝盤點項目」。
5. 點任一「未盤點」或數量欄位，輸入非負數，按 Enter／離開欄位。重新整理後應保留數量。
6. 在已選擇的盤點日期按「列印盤點紙」：預覽應包含該日期的所有盤點項目，數量欄應留白；按「列印」後應開啟系統列印對話框。
7. 用只有閱讀權限的角色測試：可看列表，但數量不可點擊修改，也沒有「新增盤點記錄」。
8. 用無此頁權限的角色測試：應顯示無權限頁面，且無法經 API 讀寫資料。
9. 用有刪除權限的角色刪除一個日期：確認後該日期與其所有盤點行都應消失；沒有刪除權限的角色不應看到垃圾桶按鈕。

## 重要實作規則

- `create_packing_stocktake` 與 `create_ingredient_stocktake` 是冪等操作：使用日期 + ingredient UUID 組成 `legacy_id`，而且以日期範圍再檢查一次，避免重複。
- `stocktake_at` 以 `Asia/Hong_Kong` 的當日零時建立；前端同樣以香港時區範圍查詢該日資料。
- 不要把資料建立邏輯改成瀏覽器直接 insert。保留 RPC 可同時處理授權、可盤點條件與重複保護。
- 數量更新目前由 `packing_stocktake_events` 的 update RLS policy 控制；不要為求方便開放 `anon` 或取消 RLS。

## 本地驗證狀態

- TypeScript：已透過 `node node_modules/typescript/bin/tsc -b --pretty false`。
- 已新增：`test/packing-stocktakes.test.tsx`。
- Vitest 尚無法啟動，原因是目前 `node_modules` 缺少 Rolldown 的 optional native binding。修復依賴後執行：

  `npm run test -- test/packing-stocktakes.test.tsx`

  若仍出現同一 native-binding 錯誤，請依 npm 提示以乾淨的依賴安裝修復；不要刪除工作區或未提交的專案檔案。

## 相關檔案

- `src/components/PackingStocktakesPage.tsx`
- `src/lib/packing-stocktakes.ts`
- `supabase/migrations/20260818170000_packing_stocktake_records_page.sql`
- `test/packing-stocktakes.test.tsx`
