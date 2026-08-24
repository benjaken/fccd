## 1. 資料模型與相容層

- [x] 1.1 新增 supplier quote parse run、階段狀態、版本、錯誤摘要及統計欄位的向後相容 migration，並以資料庫檢查確認既有 document／confirmed line 不被修改且新索引與約束生效
- [x] 1.2 擴充候選 line 的 raw fields、欄位級 evidence、validation errors／warnings、parse run reference 及人工修正欄位，並以 migration 測試確認 legacy row 仍可讀取
- [x] 1.3 為 parse run、候選 evidence 及重試操作補齊 RLS／action permission，並以授權測試確認無權角色不能讀取私密解析資料或觸發重試
- [x] 1.4 更新前後端 supplier quote 型別與 legacy mapping，並以 TypeScript 局部檢查及 API mapping 單元測試確認新舊 payload 均可處理

## 2. 固定 PDF 抽取與版面重建

- [x] 2.1 為 A-Mart 多欄、Euro Foodstuff 混合表格及泰豐雙欄建立去敏 extraction fixture／golden expectation，並確認 fixture 涵蓋商品編號、雙語名稱、多規格、TBA／暫缺及條件文字
- [x] 2.2 將 PDF 抽取重構為座標化 page／item IR，保存頁碼、bounding box、方向及閱讀順序，並以抽取單元測試確認來源定位和頁序穩定
- [x] 2.3 實作供應商無關的 row、column、table block 版面分組與續行合併，並以三組 fixture 測試確認雙欄商品不會互相串行、混合頁面可分區解析
- [x] 2.4 實作 extraction IR 大小限制、private storage 落盤及資料庫摘要引用，並以大頁數 fixture 驗證不會無限制寫入 `raw_extraction jsonb`

## 3. Profile、候選識別與驗證

- [x] 3.1 實作 supplier profile 版式簽章、版本選擇及欄位 mapper，並以 profile 測試確認已知版式優先使用活動版本、版式不符時停止套用
- [x] 3.2 定義版本化候選 JSON schema 與共用 validator，並以單元測試確認無證據價格被拒絕、TBA／暫缺不會轉成 0、未知單位不會預設為 kg
- [x] 3.3 實作日期、供應商及條件候選的來源化輸出，並以測試確認檔名／內文／metadata 日期衝突、未識別供應商及附加費／最低訂購條件均保留原文和來源
- [x] 3.4 實作固定 fingerprint 及 alias-first 商品匹配打分，限制候選於供應商商品關聯，並以測試確認同名不同規格保持不同 variant、每個建議具有可解釋原因
- [x] 3.5 實作 provider-neutral AI adapter、嚴格 schema 驗證、timeout／重試／成本上限及敏感錯誤清理，並以 mock provider 測試確認成功、畸形 JSON、timeout、未配置 provider 都能安全降級
- [x] 3.6 串接 profile-first、AI-fallback 規則，只把低覆蓋或未知 layout block 送入 AI，並以整合測試確認傳送 payload 不含原始 PDF、storage URL、client secret 或不必要頁面

## 4. 導入編排、冪等與重試

- [x] 4.1 將 `supplier-quote-ingest` 重構為檔案驗證／去重、parse run 建立及分階段執行，並以函式測試確認有效上傳、無權上傳、非 PDF、超限檔案及相同 SHA-256 的行為
- [x] 4.2 實作 parse run 階段轉移與聚合狀態，並以測試確認文字空白文件進入 `ocr_required`、可恢復錯誤進入 `parse_failed`、成功文件進入待審核
- [x] 4.3 實作候選的原子發布策略，並以資料庫／函式測試確認新 run 只替換未確認候選，任何重試都不刪除或覆寫 confirmed line
- [x] 4.4 新增具相同權限邊界的重試入口與非敏感診斷回應，並以重試整合測試確認每次嘗試可追蹤、重複請求冪等且失敗後可恢復

## 5. 人工審核與安全確認

- [x] 5.1 更新導入畫面以呈現上傳中、識別中、待確認、需 OCR、失敗及已確認狀態，並以元件測試確認 OCR／失敗文件顯示正確說明及可用操作
- [x] 5.2 在審核畫面顯示供應商／日期候選的來源與衝突，並以元件測試確認有衝突時不能未經使用者選擇直接確認
- [x] 5.3 擴充候選表格以顯示頁碼、原文、raw fields、信心原因、validation 警告、條件及規格差異，並以元件測試確認低信心或有 error 的行不會預選
- [x] 5.4 支援使用者選擇追蹤行、修正商品／規格 fingerprint／價格單位及標記新商品待建立，並以互動測試確認未選行不進入比較、不同 variant 不會合併
- [x] 5.5 強化確認 RPC 的 transaction 驗證並保存 alias／profile 建議及審計資料，並以 RPC 測試確認 AI 無法直接確認、必要對應缺失時拒絕、成功提交不改寫凍肉主檔或入貨資料

## 6. 局部驗證與交付準備

- [x] 6.1 對三組代表 fixture 執行端到端導入測試，核對候選數量、價格／狀態、頁碼證據、日期衝突及商品 variant，並保存可重現的驗證結果
- [x] 6.2 執行 supplier quote 相關 Vitest、Edge Function 型別檢查及受影響 TypeScript 檢查，修正所有局部失敗；完整回歸留待整個開發窗口完成時統一執行
- [x] 6.3 補充 server-side provider、feature flag、timeout、檔案大小及成本上限的環境設定範例與部署說明，並檢查前端 bundle／日誌不包含 provider secret 或供應商完整原文
- [x] 6.4 在 AI fallback 關閉與開啟兩種設定下完成測試環境 smoke check，確認可隨時關閉 AI 而保留固定解析、人工審核及既有報價查閱能力
