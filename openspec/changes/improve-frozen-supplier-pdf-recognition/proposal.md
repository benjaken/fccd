## Why

目前凍肉供應商 PDF 上傳已具備文字抽取、簡單規則解析及人工確認流程，但識別器主要按單行正則表達式猜測價格與商品，無法可靠處理 A-Mart 多欄目錄、Euro Foodstuff 混合表格及泰豐雙欄／條件文字等代表性格式。需要把導入流程升級為可追溯、可配置、可人工覆核的通用識別管線，才能在不為每個供應商新增程式分支的前提下擴展至二十多家供應商。

## What Changes

- 將 PDF 導入拆分為固定抽取、供應商 profile 套用、結構化候選識別、程式驗證及人工確認等受控階段。
- 支援多欄／雙欄表格、跨欄商品資料、中英文名稱、商品編號、多規格／包裝／價格單位，以及 TBA、暫缺與條件文字的候選輸出。
- 為格式未知或 profile 失效的文件加入 AI 結構化識別介面；AI 只能產生候選與信心分數，不能確認商品、日期、價格或正式資料。
- 保存每筆候選的 PDF 頁碼、原文、原始欄位、解析器／模型版本與驗證結果；數值、單位、貨幣及日期衝突由固定程式檢查。
- 使用已確認的商品別名、規格對應及欄位規則更新 supplier profile，後續相同供應商優先使用已確認設定，而非新增供應商專用 TypeScript 分支。
- 明確處理重複文件、可重試解析、文字空白 PDF 的 `ocr_required` 狀態及解析失敗狀態；本期不實作 OCR，但保留後續處理入口。
- 改善審核畫面，使使用者能確認供應商與日期、選擇要追蹤的候選、修正商品／規格／單位並查看低信心或規格差異提示。

## Capabilities

### New Capabilities

- `frozen-supplier-pdf-recognition`: 定義凍肉供應商 PDF 的安全導入、通用結構化識別、驗證、人工覆核、profile／alias 學習及失敗處理行為。

### Modified Capabilities

無。

## Impact

- 前端：`SupplierQuotePage` 的上傳及候選審核流程、供應商報價 API 型別與錯誤呈現。
- 後端：`supplier-quote-ingest` Edge Function、解析模組／AI adapter、supplier quote profile／line／condition／alias 資料存取及重試流程。
- 資料庫：可能擴充現有 supplier quote tables，以保存欄位級原始證據、驗證結果、解析工作狀態及 profile 版本；不改寫 `raw_meat_stock_movements`、`raw_meat_items` 或既有已確認報價版本。
- 部署：需要選定可輸出結構化 JSON 的 AI provider、server-side secret、timeout／檔案大小／成本限制；OCR runtime 不在本期範圍。
- 測試：新增代表三種版面的解析 fixture、驗證／安全規則測試、導入 API 測試及審核 UI 測試。
