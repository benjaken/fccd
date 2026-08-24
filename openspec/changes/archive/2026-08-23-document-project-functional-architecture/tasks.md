## 1. 分析格式與安全範圍

- [x] 1.1 定義架構文件目錄、功能卡片 schema、證據 ID、confidence 值及來源優先序，並以一份最小 fixture 驗證欄位可被人讀取及索引腳本解析
- [x] 1.2 定義只讀分析 allowlist、secret／PII／供應商敏感資料 redaction 規則，並以 `.env`、migration、fixture 及日誌樣本做負向測試確認敏感值不會輸出
- [x] 1.3 建立領域詞彙初稿與命名規則，並以現有 README、Sitemap、PRD、程式及 migration 交叉檢查同義詞（例如訂單、報價、入貨、庫存、角色／permission）是否被明確區分

## 2. 機械索引與證據底稿

- [x] 2.1 建立可重跑的 route／入口索引，涵蓋 `src/App.tsx`、工場、司機、客戶、migration 及公共／測試入口，並以 route 數量和檔案路徑抽樣核對索引完整性
- [x] 2.2 建立 module／import／呼叫索引，涵蓋 `src/components`、`src/lib`、`src/auth` 的主要 interface、Supabase `.from`／`rpc`／Storage 呼叫及跨模組依賴，並以三個代表領域人工回溯符號
- [x] 2.3 建立資料庫索引，提取 migrations 的 table、view、function／RPC、trigger、policy、index 及 Storage bucket 關係，並以 migration 名稱及 SQL 行號抽樣驗證不把推定寫成現況
- [x] 2.4 建立 Edge Function／第三方整合索引，記錄入口、驗證方式、讀寫資料、外部 provider、webhook／callback 及 secret 使用位置，並以函式目錄逐項對帳
- [x] 2.5 建立 permission／test／docs 索引，連結 page key、action key、角色、測試檔案、PRD、Sitemap 及 migration 報告，並輸出未分類 key／未引用文件報告

## 3. 功能邏輯提煉

- [x] 3.1 按訂單、報價、產品、凍貨、中央廚房、供應商／乾貨、配送、餐廳、財務、報告、系統及 migration 分組，為每組建立功能清單及穩定功能 ID，並以每組至少一個 route、module、data object、permission 和 test 證據驗收
- [x] 3.2 為每項功能填寫 purpose、entrypoints、actors、states、business rules、modules、data reads／writes、permissions、integrations、tests、evidence、confidence 及 open gaps，並以三項端到端功能人工走讀確認每個欄位都有證據或明確缺口
- [x] 3.3 從頁面與 `src/lib` interface 提煉狀態轉換、錯誤處理、保存／刪除邊界及外部副作用，並以訂單、報價、凍貨庫存、配送各一條流程檢查摘要沒有把 UI 文案誤當業務規則
- [x] 3.4 標記 deep module、adapter、seam、shallow pass-through 及跨頁面重用的 interface，並以至少五個高耦合 module 的 caller／test 抽樣驗證設計術語與程式行為一致

## 4. 關係圖與跨域鏈路

- [x] 4.1 建立角色／角色權限／頁面／action permission 矩陣，並以 `usePageAccess`、nav、migration 和代表 UI 操作核對「可見」與「可執行」是否被分開記錄
- [x] 4.2 建立核心資料實體與讀寫關係圖，涵蓋訂單、報價、產品、原料／凍貨、庫存移動、配送、付款、餐廳及 migration 實體，並以 table／RPC／report 來源回溯每條主要邊
- [x] 4.3 建立 React → `src/lib` → Supabase → Storage／Edge Function／第三方的主要流程圖，並以訂單生產、配送、報價 PDF、Bubble migration 及 Shopify／Email／QZ 等整合各做一次鏈路驗證
- [x] 4.4 為跨域共享資料、狀態或副作用補上 owner、方向、觸發條件及 evidence ID，並產出未能判斷方向的關係清單供人工覆核

## 5. 現況、意圖與差異整理

- [x] 5.1 對照實際 routes／nav 與 `docs/SITEMAP.md`，分類已一致、程式已有但 Sitemap 未列、Sitemap 有但未接通及命名不一致項目，並為每項附雙方證據
- [x] 5.2 對照 PRD、README、migration 報告與實際實作，分類 confirmed、inferred、intent-only、contradicted 及 legacy，並禁止以「看起來應該」填補缺失流程
- [x] 5.3 建立高風險邊界清單，涵蓋權限／RLS、付款、供應商價格、PDF／Storage、migration service role、外部 secret 及實際入貨／庫存寫入，並為每項記錄目前保護與缺口
- [x] 5.4 建立 open gaps／後續 ADR 或 change backlog，將需要產品決策的矛盾與單純文件缺漏分開，並由代表性 owner／來源核對分類正確

## 6. 文件交付與維護

- [x] 6.1 產出功能目錄、領域詞彙／模型、資料流／整合圖、權限矩陣、證據索引及差異／缺口報告，並以功能 ID、route、table、permission key 反向搜尋抽樣確認可定位
- [x] 6.2 為文件加入索引更新說明、分析日期、涵蓋 commit／工作樹假設及新功能變更時的維護步驟，並以一次本地重跑驗證輸出可更新而不修改產品程式
- [x] 6.3 執行 Markdown／Mermaid／內部連結／路徑／證據行號檢查及敏感資料掃描，修正所有阻斷性問題並保存檢查結果
- [x] 6.4 對每個主要領域做至少一個人工證據 walkthrough，確認「使用者目的 → 入口 → 規則 → 資料 → 權限 → 副作用 → 測試」鏈路完整；完整產品回歸不因本文件變更提前執行
