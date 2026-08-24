## Context

現有 `/frozen/supplier-quotes` 已有 private bucket、文件／候選／profile／alias 資料表、上傳 Edge Function、人工確認 RPC 及審核 UI。當前識別器在單一同步請求內用 PDF.js 抽取文字，再以行級正則表達式解析價格及商品；這會把版面重建、欄位辨識、商品匹配及資料保存耦合在一起，亦未實際使用 profile、alias 或 AI adapter。詳見 `proposal.md` 與 `specs/frozen-supplier-pdf-recognition/spec.md`。

代表文件最長約 37 頁，並包含多欄、雙欄、同文件混合表格、TBA／暫缺及價格條件。Supabase Edge runtime、外部 AI timeout、50 MB 上限及供應商價格資料的私密性，決定了導入需要可重試、可分段及失敗封閉的架構。

## Goals / Non-Goals

**Goals:**

- 把抽取、識別、驗證、匹配及保存拆成可獨立測試的階段。
- 讓三種代表 PDF 版式產生穩定且有頁碼／原文證據的候選 JSON。
- 以 profile 與 alias 資料驅動供應商差異，未知版式才使用 AI fallback。
- 保持現有確認 RPC 的「人工提交才成為正式報價」邊界。
- 允許安全重試、解析器升級及逐次診斷，而不破壞 confirmed 資料。

**Non-Goals:**

- 本期不執行圖片 OCR；掃描文件只進入 `ocr_required`。
- 不由 AI 計算價格變動、異常門檻或估算成交成本。
- 不自動建立凍肉商品、不改寫實際入貨資料、不自動確認報價。
- 不為 A-Mart、Euro Foodstuff 或泰豐建立供應商名稱硬編碼 parser。

## Decisions

### 1. 使用有版本的分階段 parse run

導入入口先驗證權限、檔案及 SHA-256，保存文件後建立 parse run；解析器依序產生 `extraction -> layout -> recognition -> validation -> matching` 結果。文件保留目前面向 UI 的狀態，新增 parse run 保存每次嘗試的狀態、版本、耗時、非敏感錯誤及統計。未確認候選可在新 run 成功後原子替換；confirmed line 永不原地替換。

這比繼續把所有步驟放在單一大函式更容易重試及測試，也避免只靠 `document.parser_version` 無法追蹤多次解析。第一版可由同一 Edge Function 依階段執行，不強制立即引入新佇列服務；入口需要在 runtime 時限內分頁／分批，超時則留下可重試狀態。

**Alternative considered:** 完全同步並直接刪除重建候選。實作較少，但無法安全處理 AI timeout、診斷失敗或保護 confirmed line，故不採用。

### 2. 保存座標化 extraction IR，而非只保存拼接文字

固定抽取層為每個文字 item 保存頁碼、文字、bounding box、字型方向及閱讀順序，然後按幾何距離建立 row、column、table block。layout 層輸出供應商無關的 block／cell IR；profile 只描述頁首頁尾、欄位別名、欄位順序、續行及條件範圍等資料規則。

IR 在寫入資料庫前限制頁數與大小，完整大型中間結果可存 private storage，資料庫只保存摘要及定位引用。這保留可追溯性，又避免 `raw_extraction jsonb` 無上限膨脹。

**Alternative considered:** 延續 `y` 座標四捨五入後整行拼接。它不能區分雙欄左右兩份商品，已不符合代表版式需求。

### 3. Profile-first、AI-fallback，且 AI 僅處理必要片段

先以供應商名稱／別名、文件文字特徵及欄位簽章計算 profile match。高匹配 profile 直接將 layout IR 映射為候選；低匹配或低覆蓋區塊才送入 AI adapter。Adapter 接受版本化 JSON schema，輸入僅含必要的文字、座標化 cell、頁碼及允許的現有商品候選，不上傳原始 PDF，也不暴露 storage URL。

Provider 透過 server-side 設定選擇；adapter 負責 timeout、重試、回應 schema 驗證、token／成本記錄及敏感錯誤清理。若 provider 未設定或失敗，固定解析結果仍可進入人工審核；AI 不是保存文件的必要條件。

**Alternative considered:** 每份文件都把完整 PDF 送給模型。雖可減少本地 layout 工作，但成本、隱私、可追溯性及數字幻覺風險較高，故不採用。

### 4. 所有候選通過 deterministic validator

AI／profile mapper 的輸出先經統一 schema，再由 validator 執行：

- 價格必須能在欄位證據中找到並通過 locale-aware 數字解析。
- TBA／暫缺／空白強制 `quoted_price = null`。
- 貨幣與單位保留原文；只有明確映射才填標準值，不預設 `kg`。
- 每筆候選必須有有效頁碼、來源 block／cell 及原文。
- fingerprint 由已驗證的商品 code、名稱、產地、規格、包裝、加工方式與定價條件以固定函式生成。

Validator 產生 errors／warnings；有 error 的候選不可預選，有 warning 的候選需在 UI 明示。價格變動及門檻仍由既有固定比較程式計算。

### 5. 商品匹配採用 alias 優先的可解釋打分

匹配順序為：同供應商精確商品 code + fingerprint alias、名稱／規格 alias、`raw_meat_item_suppliers` 限定候選、名稱與規格 token 相似度，最後才可由 AI 建議。每個分數分量及命中證據寫入 match reason。僅精確 alias 且無 validator warning 的高信心候選可預設勾選；所有候選仍需使用者提交。

確認時，把使用者最終選擇寫入 alias；只有擁有 settings/review 權限的操作才可提出或啟用 profile 規則更新。Profile 採用版本化、審核後啟用，不直接用單次 AI 輸出覆蓋活動版本。

### 6. 日期及供應商候選按來源保存

日期偵測結果改為 `{value, sourceType, sourcePage, sourceText, confidence}`，供應商候選亦保存命中別名／文字證據。不同來源存在多個有效值時，UI 不自動選定正式值；使用者必須確認。無衝突時可預填，但提交前仍由使用者操作確認。

### 7. 保持現有確認邊界並擴充審閱 payload

候選 line 新增 raw fields、evidence、validation、parse run 與建議 variant 資料。審閱 UI 可修改商品、規格 fingerprint、價格單位及選擇狀態，但不得直接更改原始證據；人工修正值與原始值並存。確認 RPC 在單一 transaction 內驗證文件狀態、權限、supplier/date、已選 line 所屬 run 及必要映射，然後保存 confirmed line、alias 和審計資訊。

## Risks / Trade-offs

- [PDF.js 座標重建對複雜表格仍可能出錯] → 以三份真實 PDF 建 fixture golden files，顯示原文證據，並在 coverage 低時降級到 AI／人工審閱。
- [AI 輸出不穩定或服務不可用] → 嚴格 JSON schema、deterministic validator、分塊重試、成本／timeout 上限及無 AI 降級路徑。
- [Profile 學到錯誤規則會放大錯誤] → Profile 版本化、需審核啟用、保存歷史版本，並在版式簽章變化時停止自動套用。
- [Parse run 與候選版本增加資料量] → 限制 IR 大小、將大型 extraction 放 private storage、為失敗 run 設保留政策，但永久保留 confirmed line 的證據引用。
- [非同步／分階段狀態增加 UI 複雜度] → 對使用者只呈現上傳中、識別中、待確認、需 OCR、失敗及已確認六類聚合狀態，詳細階段放診斷區。
- [舊文件缺少新 evidence 欄位] → 舊記錄保持可讀並標示為 legacy；不回填無法證明的欄位，也不影響既有 confirmed 報價。

## Migration Plan

1. 新增向後相容的 parse run、evidence／validation 欄位、狀態約束及索引；保留現有表和確認資料。
2. 部署新解析模組與 provider adapter，但以 feature flag 關閉 AI fallback；先用 fixture 及測試環境文件驗證固定抽取、profile mapper 和 validator。
3. 更新導入 API 與審閱 UI，支援新狀態與候選 payload；舊 document／line 繼續走 legacy read mapping。
4. 對三家代表供應商建立經人工審核的初始 profile，並逐家啟用新管線；比較候選數量、價格準確率、警告率及人工修正率。
5. 配置 provider secret、timeout 與成本上限後開啟 AI fallback；出現異常時可關閉 flag，固定解析及人工審閱仍可使用。
6. 回滾時關閉新管線 flag 並恢復舊 ingest 路徑；新增表／nullable 欄位保留，不刪除 parse run 或 confirmed 資料。

## Open Questions

- 首个 production AI provider、模型名称及单文件成本上限在部署配置阶段确定；adapter contract、失败行为及验收标准不依赖具体 provider。
- OCR runtime 与扫描文件保留期限将在后续 OCR change 中决定，本期统一停在 `ocr_required`。
