# 庫存電郵通知

## 規則

- 每日香港時間 `00:00` 產生一封庫存摘要，檢查香港日期今天起連續 14 日（含今天）。
- 預測同時計算：
  - 尚未出貨的 FC 內部餐廳補貨單（`submitted`、`reviewed`、`sent_to_factory`）；
  - 所有渠道的正式客戶訂單（包括到會、Shopify 及其他來源），按訂單 BOM 快照或當前產品／套餐 BOM 展開食材及包裝；已取消訂單與作廢明細不計。
- FC 乾貨若已連結 `ingredient_id`，其需求會與到會 BOM 的同一食材合併，避免分開計算而低估總需求。
- 即使沒有不足項目，每日仍會寄出「暫無不足」摘要。
- 若正式訂單產品或套餐未設定任何食材／包裝 BOM，摘要會逐項列為「尚未設定用料」，不會靜默當成零用料。
- 每個 FC 貨倉品項以及參與食材／包裝盤點的 ingredient 均可設定最低庫存。
- 現有庫存等於或低於最低庫存時，只在由正常跨入不足狀態時寄一次；庫存回升後再跌至門檻才再次寄送。

## 庫存口徑

- 乾貨：`shop_dry_stock_movements` 淨額；已映射 ingredient 的乾貨使用其最新自動盤點快照。
- 凍貨：按 SKU 對應生肉／製成品流水；生肉會按貨品單位換算。
- 到會食材及包裝：`ingredient_stocktake_events` 與 `packing_stocktake_events` 的最新有效數量。
- 未映射或未盤點但已有未來需求的品項會列入每日不足摘要，不會假設庫存為零以外的數字。

## 收件人與寄件

- 使用 Resend，由 server-side `RESEND_API_KEY` 發送。
- 收件人沿用「電郵通知」中已啟用、可登入的 `email_noti` 使用者及其額外電郵地址。
- 不使用客戶訂單內的電郵快照。

## 部署設定

- Supabase Secret：`INVENTORY_EMAIL_CRON_SECRET`。
- Vault `inventory_email_cron_secret` 必須與上述 Secret 相同。
- Vault `inventory_email_notifications_enabled=true` 才會建立 production cron。
- Vault `inventory_email_function_url` 可覆蓋預設 Edge Function URL。
- 部署 `inventory-email-notifications` Edge Function 後再套用 migration。
