## Why

客人用 WhatsApp／預覽對話問完一題 FAQ 後，往往還有同主題的後續問題，但目前只能自己再打字。Bot 回答後若能立刻出示 2–3 條相關 FAQ 供一鍵點擊，可降低輸入成本、提高自助完成率，並減少「還有冇其他相關問題」的來回。

## What Changes

- FAQ 回答成功時，系統一併回傳最多 3 條「相關 FAQ 問題」（不含剛回答的那條）。
- 後台客服 FAQ 預覽對話：相關問題以可點擊建議列顯示在該則 bot 回覆下方；點擊後把問題文字貼入對話框並自動送出，走既有 preview turn 流程。
- 正式 WhatsApp 回覆：在 FAQ 正文後附加「你可能仲想問」文字清單（編號問題），客人可回覆編號或直接打問題；本期不做 WATI interactive buttons／list message。
- 僅在 bot 成功回答 FAQ（含模型改寫但仍有 FAQ 來源）時顯示；`no_faq`、轉真人、`human_owned`、查單／蒐集意見等回覆不顯示相關建議。
- 相關題目來源優先使用同一次 FAQ 搜尋的其餘命中；不足時可補同 category 的其他已發布 FAQ。不得杜撰未發布條目。

## Capabilities

### New Capabilities

- `related-faq-suggestions`: 定義 FAQ 回答後的相關問題挑選、預覽一鍵送出，以及 WhatsApp 文字建議清單行為。

### Modified Capabilities

無。主規格目錄尚無已歸檔的 `whatsapp-customer-service`；本期以獨立能力描述，不改寫其他已歸檔能力。

## Impact

- 後端：`customer-service-bot` 的 FAQ turn 結果新增 `relatedFaqs`（或等價欄位）；`wati-customer-service` preview／正式回覆組裝需帶出建議；正式出站文字需附加建議清單。
- 前端：`CustomerFaqPage` 預覽氣泡下方新增建議列；點擊觸發 composer 填入＋自動 submit。
- 客戶端 API：`previewCustomerServiceTurn` 回傳型別擴充。
- 資料庫：沿用 `customer_faqs`／`search_published_customer_faqs`，本期不新增表；可不做 migration。
- 測試：bot FAQ turn 相關題挑選、preview UI 點擊送出、正式回覆文字格式、邊界（無命中／僅一條／human_owned）。
