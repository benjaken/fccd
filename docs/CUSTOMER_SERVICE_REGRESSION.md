# 客服對話回歸測試

案例放在 `test/fixtures/customer-service-regression/*.json`，隨程式碼一起審查及版本管理。

## 執行

```sh
npm run test:customer-service-regression
npm run test:changed
npm run build
```

`test:changed` 在程式碼、測試、Supabase、腳本或 package 設定有修改時，一律加入對話回歸測試；`build` 已先執行 `test:changed`。失敗會阻止 build。純文件變更不觸發案例。編輯檔案本身不會自動啟動程序；開發時可用 `npm run test:watch -- --dir test test/customer-service-regression.test.ts` 持續監測修改。

報告輸出至 `output/customer-service-regression/latest.md` 及 `latest.json`（不提交 Git），列出逐輪客人問題、目前回覆、預期條件、差異及待確認案例。JSON 另外保存歷史參考回覆。

## 匯入真人或舊測試對話

先將**單一對話、按時間排序**匯出為 JSON：

```json
{"messages":[
  {"role":"customer","text":"請問星期日係咪唔送貨？","occurredAt":"2026-09-15T07:00:00Z"},
  {"role":"human","text":"請提供送貨時間"},
  {"role":"customer","text":"下午六點"}
]}
```

```sh
npm run regression:import -- --input transcript.json --id sunday-followup --title "星期日送貨追問"
```

支援 `customer`、`assistant`、`human`，也接受資料庫欄位 `message_text`、`created_at`。連續客人訊息會合併，歷史回覆保存為 `referenceReplies`，不會自動變成正確答案。匯入不覆寫同名案例。

工具遮蔽常見電話、電郵、連結、訂單號及有標籤的姓名地址；仍須人工檢查未標籤姓名、地址等個資，原始匯出檔不要提交 Git。

## 將 draft 確認為 approved

1. 核對來源及去識別化內容，設定 `clock` 為帶時區的固定時間。
2. 在 `world` 放當時適用的 `rules`、`products`、`faqs`、`orders` 或 `items`；服務故障可設 `intakeFailure` 為 `unknown` 或 `error`。
3. 每輪填 `expect`，明確設定建單及通知次數，按目前已確認業務規則訂出回覆要點。舊答案可能錯誤或已過時，不可直接照抄。
4. 設 `status: "approved"`，執行測試並審查差異。

例：

```json
{"customer":"請問星期日係咪唔送貨？","expect":{
  "replyContains":["20/9","時間"],
  "replyExcludes":["undefined"],
  "intakeDate":"2026-09-20",
  "effects":{"writeInquiry":0,"queueHandoff":0}
}}
```

可用條件：`replyContains`、`replyExcludes`、`replyEquals`（null 表示不回覆）、`intent`、`state`、`pendingRequest`、`slots`、`effects`、`failureReason`、`intakeDate`、`intakeTime`。每輪 effects 次數獨立計算。措辭容許調整時用關鍵事實；必須固定文字時用 `replyEquals`。

多輪測試將本輪程式實際產生的狀態和訊息傳給下一輪，可捕捉遺失日期、時間及確認狀態。不要為了通過測試直接更新預期；先判斷是回退，還是已獲確認的新規則，再修改案例。

## 範圍與限制

這是離線回歸測試：執行真正的客服流程、日期計算及通用接單規則，固定資料並模擬建單/通知，不會發送訊息或寫入資料庫。

預設使用本地分類器；`recordedClassification` 可重播過往 AI 分類結果，但**不會呼叫真實大模型**，因此不能驗證模型或提示詞改動後的語意理解品質。該部分仍需另外執行線上 AI 預覽驗收。此測試也不驗證線上資料庫規則是否與案例資料一致。
