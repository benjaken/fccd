## Why

FCCD 的功能邏輯目前分散在路由、React 頁面、`src/lib` 資料模組、Supabase migrations／RPC／RLS、Edge Functions、權限設定及測試中；既有 Sitemap 與實際路由也可能隨開發進度產生落差。需要一次以程式碼為證據建立全專案功能與關係地圖，讓後續開發、除錯、交接及影響評估都有一致的入口。

## What Changes

- 以整個 repository 為範圍，盤點實際可用的入口、路由、頁面、工作流、資料模組、報表、設定及外部整合；把測試入口與未接通／遺留程式分開標示。
- 為每項功能提煉「使用者目的 → 入口 → 狀態／業務規則 → 資料讀寫 → 權限 → 外部副作用 → 測試證據」的可追溯摘要，而不是只列檔案名稱。
- 按領域整理訂單、報價、產品、中央廚房、凍貨、乾貨／餐廳、供應商、配送、財務、報告、系統管理及 Bubble migration 等能力，記錄跨領域連結和共享資料實體。
- 建立資料與流程關係圖，涵蓋 React → `src/lib` → Supabase RPC／table → Storage／Edge Function／第三方整合的主要讀寫路徑，以及角色／頁面／action permission 的控制點。
- 對照 `docs/SITEMAP.md`、README、PRD、路由和資料庫實際內容，輸出已確認、推定、過時、未實作及矛盾項目，所有結論附檔案／符號／migration／測試證據。
- 定義專案領域詞彙、模組 seam、核心不變條件及高風險資料邊界，供後續功能提案與 code review 直接引用。
- 建立可重跑的盤點索引與更新規則；本次只新增／更新架構文件與必要的文件驗證工具，不改變產品執行行為。

## Capabilities

### New Capabilities

不新增產品能力；本變更是文件、可追溯性及維護工具改善。

### Modified Capabilities

無。本 change 已在 `.openspec.yaml` 宣告 `skip_specs: true`，因為不改變執行時行為或產品需求。

## Impact

- 文件：新增架構／功能目錄、領域模型與詞彙、資料流／整合圖、權限矩陣、證據索引及維護說明，並視需要修正 Sitemap 的明顯差異標記。
- 分析範圍：`src/App.tsx`、`src/components`、`src/lib`、`src/auth`、`supabase/migrations`、`supabase/functions`、`scripts`、`test`、`docs` 及設定檔。
- 工具：可加入只讀的 route／import／migration／permission 索引腳本或檢查，輸出必須可由人工抽樣回溯到原始碼。
- 風險控制：不把推斷內容寫成確定事實；不讀取或輸出 secrets、`.env.local` 值、客戶／供應商敏感資料或完整遷移原始資料。
- 驗證：文件交付前執行連結／格式／索引檢查及代表性人工抽樣；不因文件變更重跑全量產品回歸。
