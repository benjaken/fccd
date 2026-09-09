# 庫存／配送寫入盤點（2026-09-09）

本文件記錄本輪已盤點與修正的範圍，不是正式環境驗收證明。所有修改仍在工作區，未提交、推送或部署。

## 共通規則

- 新訂單的有效扣減等於其已承諾配送所分配的材料需求；相同狀態／資料重試不新增有效扣減。
- 取消、作廢、零數量、轉回報價或整單取消會沖銷相應扣減；恢復後按目前需求重建。
- 配程不完整的已承諾訂單不能以成功交易留下不一致狀態。
- BOM／套餐選項關聯移動時，OLD 與 NEW 所屬訂單均刷新；取消標籤看 OLD 與 NEW 的 key。
- 全域材料交易鎖在任何行鎖或報價號碼鎖之前取得。讀取不取此鎖；相關寫入會排隊。
- 舊訂單保留整行配送匹配及首次扣減規則，不因 v2 安裝而停止扣料，也不自動改成分程模式。取消舊訂單／配送時沖銷其有效扣減。

## 寫入入口與驗證

| 入口 | 一致性處理 | 本輪／累積驗證 |
|---|---|---|
| 訂單、商品直接 UPDATE／批次 UPSERT | statement gate；共同 refresh dispatch | 真 PostgreSQL 雙連線、最終數量 |
| save_sales_document_batch | gate 在 FOR UPDATE 前 | 實際 RPC 舊版死鎖對照＋五輪併發 |
| create_quote／customer_service_write_inquiry | gate 在 quote-number advisory lock 前 | 實際 create_quote 舊版死鎖對照＋五輪、號碼唯一 |
| 轉單、詢價轉報價、合併、工廠、車隊 RPC | 保留原授權與函式邏輯，入口先 gate | 定義盤點；並非每支 RPC 全業務端對端 |
| 自助加購與付款 capture／退款／對帳 | RPC 與 payments／checkouts statement gate | 入口盤點；外部付款服務未呼叫 |
| cancel_pending_delivery | 授權拒絕空角色；保留已取消配送與材料歷史；刪除附加費並清零費用 | 載入原取消 RPC 重現 23503，再驗證修正 API、重試、費用、權限 |
| 配送 INSERT／UPDATE／DELETE | refresh 依整單已承諾配送或有效扣減判斷 | 新增／改期歧義回滾；刪除未承諾配送重建配程 |
| BOM／選項 INSERT／UPDATE／DELETE／改綁 | 共同 OLD／NEW 訂單刷新；版本僅實質資料改動 | 空快照、重匯、舊版本隔離、跨訂單 BOM |
| 取消標籤 INSERT／DELETE／UPDATE | OLD 或 NEW 為 cancelled 即刷新兩側 | cancelled 改 monthly-settlement 恢復扣減 |
| 商品零數量、作廢、恢復與文件類型切換 | 共同 refresh | 扣減 20→0→20、quote→order |
| migration 前已存在訂單 | 獨立 legacy matching 分支 | ALTER TABLE 前植入真 legacy 訂單，放行、送達重試、取消及預測排除 |
| 預測、材料用量、通知缺配方 | 共用需求與待配送切片 | 原有區間、尾差、套餐與缺配方 SQL 回歸 |

## 驗證入口與限制

- `npm run test:inventory-sql`：PGlite 執行實際庫存 migration 與 SQL 回歸。
- `FCCD_PG_TEST_RUNTIME=<隔離 embedded-postgres runtime>` 後執行 `npm run test:inventory-concurrency -- --verify-old-lock`：隨機本機端口、獨立資料目錄，載入實際修正 RPC；舊版對照後恢復現行函式，結束清理資料庫。
- fixture 保留本次重要外鍵與 API 欄位，但總額回算、外部 JWT／支付服務等有隔離 stub。
- 倉庫共有 436 份歷史 migration（本次盤點時）；本機有 Supabase CLI，但沒有 Docker 執行檔，尚未以完整 Supabase runtime 回放全部 migration、RLS、cron、外部服務與正式資料。
- 因此已知重現案例有驗證閉環，但完整歷史資料與整合環境仍需 staging 驗證，不能直接視為正式可部署。

## 最終本機結果

- Vitest：270 個測試檔、1,855 項測試通過。
- PGlite 全部庫存 SQL 回歸通過；包含真正 migration 前的 legacy 訂單、跨盤點日期取消／恢復後庫存保持100kg，以及阻止已綁定商品／配送被改成無訂單。
- 真 PostgreSQL：五類舊鎖循環對照成功重現；現行多商品、套餐選項、實際批次儲存 RPC 與實際報價建立各五輪通過，最終數量與報價號碼唯一性斷言通過。
- 已修正 legacy 恢復扣減的時間，新增／重建紀錄按本次交易入帳，避免回填舊配送時間跨越較新的盤點基準。
- 全部變更仍未提交；完整 Supabase runtime／正式資料與外部服務整合驗證仍未執行。
