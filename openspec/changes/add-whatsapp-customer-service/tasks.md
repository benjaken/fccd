## 1. 資料模型與開關

- [ ] 1.1 新增 FAQ、入站事件、對話狀態（認身／待選單／蒐集槽位／已接手）及 `customer_service_bot_enabled` 控制的 migration，預設 bot 關閉，並以 SQL／migration 測試確認既有 `wati_notification_controls` 列與出站通知資料不被改寫
- [ ] 1.2 啟用 `pg_trgm`、為 FAQ 已發布列建立相似度索引，並以查詢測試確認未發布／停用列不會被搜尋函式回傳
- [ ] 1.3 允許報價 `source_system = 'whatsapp'`，補齊 RLS／page permission（FAQ 維護、必要時內部通知設定），並以授權測試確認 anon 不能讀 FAQ 全文或入站事件
- [ ] 1.4 為 FAQ 維護與客服 bot 開關加入 `app_pages`／role 權限，並以 permission 測試確認無對應 page key 的角色看不到維護入口

## 2. 查單與到會意見寫入

- [ ] 2.1 新增僅 service-role 可呼叫的電話查正式訂單 RPC，複用 `private.self_service_phone` 與自助遮罩欄位，並以 RPC 測試覆蓋零張、一張、多張及已封存單不可見
- [ ] 2.2 新增 WhatsApp 到會意見寫入 RPC：無單則建立 `source_system = 'whatsapp'` 待跟進報價；僅有未轉單報價則附加到最近未關閉報價，除非客人標明另一場，並以 RPC 測試確認不改正式訂單、不自動轉單
- [ ] 2.3 寫入成功後發內部同事通知（Email 及／或內部 WATI），payload 含報價號、電話與摘要，並以通知測試確認不會發到客人電郵或第二個客人電話
- [ ] 2.4 報價跟進／列表標示 WhatsApp 來源，並以列表測試確認 `emailmeform` 與 `whatsapp` 可區分且既有篩選不漏單

## 3. FAQ 搜尋與維護

- [ ] 3.1 實作只讀已發布 FAQ 的搜尋 RPC（關鍵字／`pg_trgm`、相似度門檻），並以單元測試確認命中回核准答覆、低於門檻回無匹配、停用列不出現
- [ ] 3.2 新增設定頁供獲授權同事新增、編輯、發布／停用 FAQ，並以元件測試確認無 `settings.customer_faq`（或同等）權限不能寫入
- [ ] 3.3 按 `design.md` 決策 8，從 [FAQ Logic v1](https://docs.google.com/document/d/1s7iXNDQhBPDztqW9beyR5soXFufHLvUsrUPAsU524FE/edit?tab=t.0) 只種子可發布條目（落單步驟、自取／地面交收、天氣、付款方式不含戶口、餐具內容、即食加熱等），港式繁體禮貌書面語，並以搜尋測試確認這些問法能命中，且運費表、戶口、取消退款步驟、過期優惠碼不會被搜到

## 4. WATI 入站通道

- [ ] 4.1 對帳目前租戶的入站 webhook 簽章與 session 發訊 API（v1 `live-mt-server` 或 v2 `WATI_API_ENDPOINT`），並以 adapter 測試用固定 fixture 驗證驗簽成功／失敗
- [ ] 4.2 新增 `wati-customer-service` Edge Function：驗簽、通道核對、`provider_message_id` 冪等寫入、bot 關閉則只記不回，並以函式測試確認無效簽章不查單、不寫報價、不發訊
- [ ] 4.3 實作 session 回覆適配（同一 WhatsApp 對話、24 小時窗），並以 mock WATI 測試確認回覆不會走 `sendTemplateMessage`
- [ ] 4.4 偵測同事已在該對話發 session 訊息或內部 `handoff` 標記後進入 `human_owned`，並以狀態測試確認後續入站不再自動回，直到結束接管

## 5. 意圖分流與安全邊界

- [ ] 5.1 實作規則優先的意圖分類：先攔截越權／套提示與無關閒聊（不呼叫模型），再處理危險業務與訂單號／政策／到會詞；分不清才用獨立限額小模型抽白名單 JSON 意圖，並以分類測試確認越權與危險關鍵字不依賴模型
- [ ] 5.2 接上查單工具：一張直接回摘要與加單連結、多張只列訂單號與日期、選定後只回該單，並以對話測試確認不要求電郵、不洩漏未選訂單明細
- [ ] 5.3 接上意見蒐集：至少日期或人數即可落盤，回覆「同事跟進」，不推套餐、不報死價，並以對話測試確認寫入後跟進佇列可見 WhatsApp 來源
- [ ] 5.4 接上 FAQ 工具：只回已發布條目正文；無匹配則承認不確定並轉真人，並以對話測試確認模型不能改寫 FAQ 答覆
- [ ] 5.5 危險意圖停止自動辦理、標記接手、訂單／付款資料不變，並以測試確認改期、取消、投訴、議價、付款爭議都不會寫入業務變更
- [ ] 5.6 同一則客人訊息最多一則 bot 回覆，不另發「已讀」模板，並以整合測試確認出站通知開關與 bot 開關互不推導
- [ ] 5.7 所有 bot 回覆走香港繁體禮貌模板，出站前做粗口檢查且不抄客人粗口，並以文案測試確認查單／列單／交同事／轉手句為港式書面語、不含簡體或內地客服腔
- [ ] 5.8 無關問題與套提示／改角色／要通用 AI 只用固定拒答，不回答實質內容、不洩漏提示或工具名、不寫入報價，並以對話測試覆蓋閒聊、翻譯、忽略指示、重複 prompt 等例子

## 6. 部署與回歸

- [ ] 6.1 補齊 webhook 冪等、查單三態、意見寫入、FAQ 搜尋、轉手、殺開關、口吻／粗口與越權拒答的單元／函式測試，並以 `npx vitest run` 跑本變更相關測試通過
- [ ] 6.2 對客服 Edge Function 跑 `deno check` 或 `npm run check:edge-functions`，確認型別檢查通過後才部署
- [ ] 6.3 先在 develop 對測試號碼走完查單、蒐集、FAQ、轉手，再開 production webhook；生產 bot 預設關閉，並以開關測試確認關閉後出站通知仍可發送
