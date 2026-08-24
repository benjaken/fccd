## Context

目前專案以 React/Vite 前端、Supabase 資料及 Edge Functions 為主要執行面，另有工場、司機送貨、客戶及 Bubble migration 等入口。已存在的文件包括 README、Sitemap、多份 PRD、migration 報告及 UI 標準，但它們分別描述產品意圖、現況或單一功能，沒有一份以程式碼為證據的跨層功能地圖。實際盤點範圍約為 152 個 `src/components` 檔案、95 個 `src/lib` 檔案、195 個 migration、22 個 Edge Functions 及 105 組測試檔案。

本變更是只讀分析與文件交付，不建立新的 runtime contract。分析結果必須能在 dirty worktree 中重跑，並能區分已提交程式、未接通入口、測試替身、遺留 migration 與推定中的業務規則。

## Goals / Non-Goals

**Goals:**

- 產出可由功能名稱、路由、資料表、permission key 或檔案路徑反向搜尋的功能目錄。
- 將每個功能的使用者流程、狀態轉換、主要讀寫、權限、副作用及測試證據連成一條可追溯鏈。
- 建立領域、資料實體、模組／adapter／外部整合之間的關係圖，明確標示共享資料與跨域耦合。
- 以實際程式碼和 migration 為現況證據，將 PRD／Sitemap 作為意圖來源並記錄兩者差異。
- 讓後續 change proposal 可以引用穩定的功能 ID、資料實體 ID 和證據索引。

**Non-Goals:**

- 不重構程式、不修正既有行為、不新增資料表／permission／API。
- 不把完整原始碼、完整 migration、秘密、環境變數值或敏感業務資料複製到文件。
- 不以靜態 import 圖宣稱完整的 runtime 行為；動態 query、RLS、trigger 及外部服務會標記需人工驗證。
- 不試圖在一次文件變更中取代所有產品 PRD、migration runbook 或測試說明。

## Decisions

### 1. 兩階段盤點：機械索引後人工提煉

先建立只讀索引，收集 route 宣告、component／lib import、Supabase `.from`／`rpc`／Storage 呼叫、Edge Function 入口、migration 建表／函式／policy、permission key、測試檔案及文件連結。再由人工閱讀功能群的入口與資料寫入點，補出狀態、規則、錯誤和副作用。

機械索引保證覆蓋率和可重跑；人工階段負責語意，避免把檔名或單一 import 當成完整功能。每個人工結論都必須引用至少一個 code symbol、SQL object 或測試案例；若只由 PRD 推得，標示為意圖而非已實作。

**Alternative considered:** 只由人工逐檔閱讀。它能理解深層規則，但容易漏掉跨目錄連接，也難以在後續提交後重跑，故不採用。

### 2. 以功能卡片作為最小可讀單位

每項功能使用穩定 ID 和固定欄位：`purpose`、`entrypoints`、`actors`、`states`、`businessRules`、`modules`、`dataReads`、`dataWrites`、`permissions`、`integrations`、`tests`、`evidence`、`confidence`、`openGaps`。同一功能可以包含多個 route 和 module，但不得只以檔案作為功能名稱。

文件採 Markdown 表格／小節為主，另保留可供索引腳本消費的簡單 front matter 或 JSON index；內容欄位不可依賴特定新工具才能閱讀。`confidence` 分為 `confirmed`、`inferred`、`intent-only`、`contradicted`，並與證據類型分開保存。

### 3. 以領域模型及資料流雙軸呈現關係

功能目錄按現有業務群組整理，但關係圖另以共享資料實體和流程跨域連結。至少建立：

- 使用者／角色／頁面／action permission → 可見入口與可執行操作；
- 訂單／報價／產品／庫存／配送／餐廳／財務／migration 等核心實體 → 建立、讀取、更新及報表投影；
- React page → `src/lib` module → Supabase table／RPC／Storage → Edge Function／第三方整合的主要流程；
- 事件、狀態或日期驅動的流程，例如訂單到工場、配送、收款及 migration checkpoint。

使用 Mermaid 表達小型關係圖，過大的圖拆成領域圖、資料圖和整合圖；每條非顯而易見的邊附 evidence ID。這比單一巨型 dependency graph 更能保留可讀性與定位能力。

### 4. 以 source-of-truth 優先序處理矛盾

當來源不一致，優先序為：可執行程式及資料庫約束／policy ＞ 具體測試與 fixture ＞ 已部署相關設定／migration 報告 ＞ PRD／Sitemap／README 意圖。文件不靜默選邊，而是記錄 `conflict`，指出各來源、差異和需要決策的 owner。這讓 Sitemap 落後或 route 已存在但無導航時都能被看見。

### 5. 用 deep module 詞彙描述 seam，而非堆疊依賴圖

對重要 `src/lib` 模組記錄其 interface（呼叫者必須知道的輸入、輸出、錯誤、權限、排序和副作用）、implementation、adapter 及 seam。只在有多個實作／外部變體或測試替身時標示 adapter；不把每個 React component 都誤稱為獨立領域模組。文件特別標註 shallow pass-through 與跨多個頁面重用的 deep module，協助後續重構優先級判斷。

### 6. 證據索引與敏感資料紅線

證據 ID 使用 `F-`（功能）、`D-`（資料／SQL）、`P-`（permission）、`I-`（整合）、`T-`（測試）、`DOC-`（意圖文件）前綴，引用絕對可定位的相對檔案路徑、符號或 migration 名稱及單一行號。索引只保存摘要，不保存完整 SQL、PDF、客戶資料、供應商價格或 secrets；遇到需要查證的敏感內容，只記錄存在與驗證方法。

### 7. 用更新檢查維持文件不漂移

新增一個只讀索引／驗證入口，至少檢查 route、permission key、功能卡片 ID、引用檔案及 Mermaid 連結仍存在，並報告未分類的新入口。它不在 build 或 runtime 強制執行，避免文件暫時落後阻塞產品部署；功能變更完成後再由維護任務更新架構文件。

## Risks / Trade-offs

- [整個專案範圍大，單次人工摘要可能遺漏深層規則] → 先用機械索引建立覆蓋清單，再按高風險／高耦合領域抽樣核對，保留 `openGaps`。
- [靜態分析無法看見 runtime 動態行為] → 對動態 query、RLS、trigger、Edge Function 部署及第三方 callback 顯示「需 runtime／環境驗證」，不過度推論。
- [文件與程式碼很快漂移] → 保留可重跑索引、穩定 ID、未分類入口報告及每項功能的最近驗證日期。
- [圖表過大而不可讀] → 以領域／流程拆圖，功能卡片負責細節，關係邊使用 evidence ID 回到索引。
- [分析文件意外暴露敏感資料] → 明確的 redaction 規則、只讀路徑 allowlist 及交付前 secret／PII 關鍵字掃描。

## Migration Plan

1. 建立文件目錄、詞彙／證據格式與只讀索引輸出位置；不改動既有產品文件或 runtime 設定。
2. 生成 route、module、Supabase、Edge Function、permission 及 test 的機械索引，先核對索引本身可回溯到原始檔案。
3. 分領域完成功能卡片，先處理訂單／報價／產品／凍貨／廚房／配送／餐廳／財務／系統／migration，再補公共入口與報告。
4. 補上領域詞彙、資料實體、流程圖、權限矩陣、外部整合與高風險不變條件，並標示 confirmed／inferred／intent-only／contradicted。
5. 以 README、Sitemap、PRD、migration 報告及測試抽樣校驗，建立差異與缺口清單；由文件 owner 確認需升格為 ADR 或後續 change 的決策。
6. 將維護索引與更新規則加入文件入口，交付後不需回滾程式；若文件結果不正確，只修正文件／索引，不影響產品資料。

## Open Questions

- 文件最終放在現有 `docs/` 下的單一入口，或按領域拆成多個檔案；可在第一次索引產生後依實際圖表大小決定，不改變分析內容。
- 是否將架構索引檢查納入 CI；先以手動／開發流程檢查交付，待文件格式穩定後再決定是否升格為 CI gate。
