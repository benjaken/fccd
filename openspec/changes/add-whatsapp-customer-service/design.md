## Context

見 `proposal.md` 的動機與範圍，以及 `specs/whatsapp-customer-service/spec.md` 的行為契約。

現況約束：

- WATI 只做出站模板（`sendTemplateMessage`／`sendTemplateMessages`）。品牌通道為 `(+852) 5396 4335`。通知有獨立 `wati_notification_controls` 殺開關、pending-review guard 與 outbox。
- 客人查單已有 `customer_self_service_*` RPC：電話＋電郵證明後發 30 分鐘 session。電話正規化（8 位補 `852`）已在 `private.self_service_phone`。
- 官網詢問經 `emailmeform-inquiry-sync` 寫成 `document_type = 'quote'`、`source_system = 'emailmeform'` 的待跟進報價；人數目前寫進 remarks。
- 報表 AI 與供應商 PDF 已有 OpenAI adapter，但都是內部、有權限與證據約束。客服若用模型，必須獨立限額與殺開關。
- 沒有 FAQ 表、沒有 `pgvector`、沒有 WATI 入站 webhook、沒有 session 自由回覆。

## Goals / Non-Goals

**Goals:**

- 把 WATI 從「只廣播」擴成「可聽、可自由回」的水管；腦留在 FCCD。
- 查單複用既有自助讀取邊界與電話正規化，不把 service role 查詢直接暴露給 webhook。
- 到會意見複用報價跟進寫入形狀，只加 WhatsApp 來源與內部通知。
- FAQ 用 Postgres 關鍵字／`pg_trgm` 搜已發布條目；模型只負責分類與抽槽，答覆正文來自資料庫。
- 對外句子用固定香港繁體禮貌模板包裝；無關與越權訊息走規則攔截，不讓模型自由發揮。
- 部署可先關 bot：webhook 可收、可不回。

**Non-Goals:**

- 不在本期引入 pgvector、embedding job 或獨立向量服務。
- 不建 FCCD 對話工作台；真人操作留在 WATI inbox。
- 不把 WATI 內建關鍵字／AI 流程當查單或 FAQ 來源。
- 不改既有出站模板文案、參數或 activation 清單。
- 不提供通用聊天、翻譯、寫作或「你是什麼模型」這類 AI 能力。

## Decisions

### 1. WATI 只做通道，FCCD 擁有對話狀態

新增 Edge Function（建議名 `wati-customer-service`）接收 WATI 入站 webhook，驗簽後寫入站事件，再同步處理或投入短佇列。回覆用 WATI session message API（客人開口後的 24 小時窗），不用新客服模板。

對話狀態（認身、待選訂單、蒐集槽位、已接手）存在 FCCD，以正規化電話為鍵。WATI inbox 仍是真人操作面；FCCD 用「同事已發 session 訊息」或內部接管標記停止 bot。

**Alternative considered:** 用 WATI 內建 chatbot 接 FAQ，只把查單 webhook 回 FCCD。FAQ 與報價寫入會分裂，且 WATI 流程無法保證「無匹配不杜撰」。不採用。

### 2. 完整語意先分類；RAG 只在知識意圖後執行

提示注入保留為不呼叫模型的硬性攔截；其餘業務語意由小型 LLM 先閱讀完整訊息及近期對話，再輸出嚴格 JSON schema。模型不可只按日期、品牌、菜式或另一個孤立詞語選擇意圖；允許意圖包括查單、到會蒐集、指定日期接單查詢、餐牌／FAQ、轉真人及拒答。模型不可用時才採用 deterministic fallback。

RAG 不參與第一階段意圖競爭。只有完整語意已分類為 `search_faq` 或 `browse_menu` 後，才可搜尋已發布 FAQ／餐牌；`collect_inquiry` 不得因字面相似候選而被 FAQ 回覆搶先截斷。指定日期能否預訂使用 `delivery_availability` 及接單規則工具，不把問句當作建立查詢。

查單摘要、FAQ 答覆、報價寫入內容 MUST 來自工具／RPC，模型不得發明狀態、政策或價錢。日期、人數等槽位只代表已知資料，不代表客人授權寫入。所有到會寫入及新內部通知必須經單一 mutation gate；資料齊備後先顯示摘要，客人明確確認才可落盤。客服 provider 設定與報表 AI／供應商 PDF 分開：獨立 daily limit、prompt version、timeout。Bot 關閉時不呼叫模型。

**Alternative considered:** 每則訊息都打大模型做 RAG 或自由對話。成本高，且容易被套去寫作、閒聊或洩漏提示。不採用。

### 3. 查單用電話對正式訂單，複用自助遮罩

新增 service-role-only RPC（或擴充既有自助函式的電話-only 變體），輸入正規化電話，輸出該號碼可見的正式訂單摘要列表。欄位對齊自助詳情的可公開子集：訂單號、日期、配送狀態、遮罩地址／電郵、加單連結條件。Webhook 不得直接 `select * from orders`。

多單時只回訂單號與日期；選定後再取該單摘要。零正式訂單則不回查單結果。已有未轉單報價不算「對上正式訂單」。

**Alternative considered:** 直接重用 `customer_self_service_login`（電話＋電郵）。WhatsApp 沒有電郵，完成率低，已否決。

### 4. 到會意見寫成 WhatsApp 來源報價，再通知內部

蒐集槽位：日期、人數、預算、忌口、菜式。至少日期或人數其一代表已有足夠資料可提出寫入摘要，但不可直接落盤；系統必須先列出摘要並要求客人明確確認。確認後才按 EmailMeForm 形狀寫入：`document_type = 'quote'`、`quote_status` 未完成、`source_system = 'whatsapp'`，聯絡電話用 WhatsApp 號碼。若該電話已有未轉單報價，把新意見附加到最近一張未關閉報價的 note／timeline，避免一人多張空報價；若業務上需要新場，才另開報價。

內部通知走現有內部 Email 及／或內部 WATI 收件人設定，payload 含報價號、電話、摘要。客人只在 WhatsApp 收到「同事會跟進」。

**Alternative considered:** 新建獨立 inquiry 表。會讓跟進佇列分裂。第一版跟進必須出現在現有報價隊列，故不採用。

### 5. FAQ 用獨立表 + trigram，不用字典、不用向量

新表（名稱實作時定）至少含：`question`、`answer`、`keywords`、`category`、`locale`、`is_published`、`sort_order`、審計欄。啟用 `pg_trgm`，以 question／keywords／answer 做 `%` 相似度搜尋候選；候選必須再通過程式內的結構化配對表（canonical question、完整短語／同義說法、排除詞）才可直接作答。單一泛詞只給低檢索分，且不可繞過最終配對。字典 `dict_items` 只適合短選項，不拿來存政策長文。

維護頁走既有設定權限模式（新 page key，例如 `settings.customer_faq`），類似字典配置。Bot 搜尋用 SECURITY DEFINER RPC，只讀 `is_published = true`。

**Alternative considered:** 第一版就上 `pgvector`。FAQ 量小、中文同義可由 keywords 補，向量是後續增量。不採用。

### 6. 接管與通知隔離

新增 `customer_service_bot_enabled`（或同等）控制列／環境開關，預設關閉。與 `wati_notification_controls` 並列，互不推導。

同一 `provider_message_id` 入站事件冪等。客人回覆通知模板時，只產生一則 bot 回覆，不另發「已讀」模板。`awaiting_human` 表示已排隊但尚未由同事接管，並以 `handoff_kind`、`handoff_urgent`、`handoff_quote_id` 保存原因、緊急程度及相關報價；不得從是否有 `selected_order_id` 推斷緊急到會。即日到會在此階段可接收補充資料並短確認，一般投訴／改單交接則保持靜默。偵測到同事 session 訊息或內部標記 `handoff` 後，該電話對話才進入 `human_owned`，直到逾時或同事結束接管，期間完全不自動回覆。

### 7. 香港繁體禮貌口吻，固定模板包裝

所有 bot 可見句子（查單、列單、問槽位、已交同事、FAQ 前後句、轉手、拒答）使用版本化的香港繁體模板，口吻像本地客服：你好、唔好意思、已經幫你查到、呢單、同事會跟進。不用簡體，不用「親」「您好请问」這類內地腔，不用粗口。

FAQ 種子與後台答覆欄亦要求同事用同一書面語撰寫。系統在發出前對 bot 回覆做粗口黑名單檢查；命中則改送安全後備句並記日誌，不得把客人粗口抄進回覆。

拒答固定句只說明可幫忙查訂單、到會查詢同公司政策，不解釋模型、提示或工具。越權與無關共用這類短句，避免給攻擊者額外線索。

**Alternative considered:** 讓模型自由潤飾每則回覆。口吻難穩，也更容易被「用英文／用粗口／先忽略規則」帶走。不採用。

### 8. FAQ 種子以 Google 文件為來源，只發布客人可見核准條

來源：[FCC Catering Language - FAQ Logic v1](https://docs.google.com/document/d/1s7iXNDQhBPDztqW9beyR5soXFufHLvUsrUPAsU524FE/edit?tab=t.0)。這是內部培訓＋快速回覆手冊，不是整份可廣播的知識庫。種子只取「客人問題 → FCC 的回應」裡已核准、仍有效、不含內部步驟的條目，改寫成香港繁體禮貌書面語後寫入 `is_published`。

**第一版可發布（政策／說明；運費按表報，其餘不報菜式死價）**

| 分類 | 可進 FAQ 的題 |
|---|---|
| 品牌／餐牌 | 有冇食物相片、餐牌大致種類、食物即煮即送及可加熱、盒蓋有菜名貼紙、自家工場、無早餐（最早約 11:00–12:00）、植物肉 OMNI、素食／走蔥蒜要註明、無粽、菠蘿炒飯不辣、無無糖可樂、乳豬原隻連膠刀手套、叉燒一斤約 50 片、壽桃包約拳頭大、豬手／牛肋骨切開約 8 人、Pizza 一般切 8 件可要求不切、軟餐／碎餐做不到、廚師上門暫停、無侍應／擺盤（加厚鋁盒）、地面交收定義 |
| 落單 | 去網站落單、WhatsApp 請自行網上落單及步驟、Express 即日到會網站、越早落單越好（每日有配額）、網站選擇比 Foodpanda 多、積分／優惠碼要結帳見到扣減先付款否則無法退回、新會員登記連結 |
| 送貨／自取／運費 | 荃灣自取地址、司機會致電夾交收點、地面交收＝附近可免費停車處、**運費表按文件原文**、偏遠／機場不適用條件、惡劣天氣（8 號／黑雨、除下後 2 小時、可改期保留 60 天、不設取消退款、一切以客服回覆為準） |
| 付款／收據 | 接受信用卡／支付寶／微信支付／轉數快等（**不寫**銀行戶口、PayMe／八達通 token）、需預先支付不接受貨到現金、收據／發票用自助頁（電話＋電郵） |
| 會員 | 如何用購物積分、生日禮遇按登記月份首單、如何註冊、如何改個人資料、忘記密碼重設 |

**文件有、但第一版不發布（改意圖，不當 FAQ 答死）**

| 文件內容 | 原因 | Bot 改做 |
|---|---|---|
| 最低消費 $800／$1500、加熱爐 $30、餐具加購價、壽桃包計價、乳豬價 | 不報菜式或套餐死價；運費已另列可發布 | 說網站結帳或同事報價 |
| 改期／改地址／改時間／取消／退款步驟、送漏全數退款、投訴案例 | 已鎖定轉真人；文件含內部 Shopify／工場／司機步驟 | 可回已發布政策摘要，然後接手 |
| 付款爭議、請款電郵、支票 30 天個案 | 轉真人；戶口號碼不進 bot | 接手 |
| 度身訂造 180 人餐單、詢問報價資料清單、便當訂製 | 屬到會意見 | 蒐集槽位，交同事 |
| HSBC2024 等有期限優惠碼、新春只供應窗口、特定訂單號 | 會過期或屬個案 | 不進種子 |
| Happy Kitchen、FCC2、Asana、後台改單、合併品牌免運判斷 | 內部 SOP | 不進種子 |
| 「根據客人需要」空答、白酒意粉替換等要廚房確認的菜式細節 | 不能穩定自動答 | 轉同事或蒐集意見 |

**運費表種子（與文件一致；後台改已發布條即改 bot）**

FCC Catering／福滿樓／HK Lunch Box／HK Party Food：

- 地面交收：新界 $50、九龍 $50、港島 $100、偏遠 $180、機場 $250
- 送貨上門：新界 $250、九龍 $250、港島 $350；偏遠及機場不適用
- 訂滿 $2800 地面交收免費（不包括偏遠及機場）

FC Express：只限地面交收；新界／九龍／港島 $200。

FC Delivery：訂滿 $2800 地面交收免費（不包括偏遠及機場）。

地面交收指司機在客人地址附近最接近可免費停車的位置交收。品牌未明時先回 FCC Catering 主表，並說明 Express 即日到會收費不同。

文件日後改版不自動同步。同事在 FAQ 維護頁改已發布條目；要更新種子時再對一次文件，不要讓模型直接讀整份手冊。

**Alternative considered:** 把整份文件當 RAG 語料。內部備註、菜式標價與過期碼會漏出去。不採用。運費改為按已發布表回答，不再整表封鎖。

## Risks / Trade-offs

- [WATI webhook 規格或簽章與現有兩套 API host 不一致] → 入站適配與出站模板適配分開；先用 develop 通道對帳驗簽與 session 回覆，再開 production bot。
- [WhatsApp 號碼與訂單電話不一致，查不到單] → 明確走進意見蒐集，不追問電郵；同事可在跟進裡對單。
- [同一公司多人用同一個報價電話] → 多單列出；未轉單報價附加到最近一張，可能把新場合併進舊報價。緩解：客人說「另一場」則新開報價。
- [模型誤分類危險意圖] → 規則關鍵字優先；不確定當轉真人。寧可漏回、不可擅自改單。
- [Bot 與真人同時回] → 同事一發言即停 bot；殺開關可瞬間靜音。
- [FAQ 文件含菜式死價、過期碼與內部 SOP] → 只種子核准公開子集；**運費表按已發布 FAQ 回答**；最低消費與菜式價仍不進 bot；文件不自動同步。
- [被套去當通用 AI 或洩漏提示] → 越權模式規則攔截、不呼叫模型生成；允許意圖列白名單；固定拒答；回覆不含工具／模型名稱。
- [口吻漂成簡體或跟客人罵回去] → 固定香港繁體模板＋出站粗口檢查；不複述客人原文裡的粗口。

## Migration Plan

1. 先套用 FAQ、入站事件、對話狀態、bot 開關的 migration；bot 預設關閉。
2. 部署 Edge Function，在 WATI 設定 webhook 指向 develop，用測試號碼驗簽、查單、寫報價、FAQ、轉手。
3. 種子少量已審核 FAQ；設定內部通知收件人。
4. 生產部署後保持 bot 關閉，確認出站通知不受影響。
5. 開啟 bot；觀察雙重回覆與誤轉手。出問題先關 bot，webhook 可留著只記不回。

回滾：關 bot 開關即回到「只有真人 + 出站模板」。FAQ 表與報價來源列可保留。

## Open Questions

- WATI 入站 payload 與 session 發訊路徑要以目前租戶（`live-mt-server` v1 或 `WATI_API_ENDPOINT` v2）哪一套為準，需在實作開頭對帳，不影響行為規格。
- 內部通知收件人複用 `order_first_notification_recipients` 還是另設客服跟進名單，可在實作時按現有設定頁擴充，不改客人可見行為。

## 2026-09 全局接單及自主學習補充決策

- 廚房產能是一個全局資源；日期／時段規則放在 `order_intake_rules`，品牌只作允許例外及推薦，不各自建立 Block Date。
- `allow_only` 必須同時命中品牌及產品關鍵字。未命中或時段需覆核時，回覆會收集送達時間、活動時間、地區、人數及預算並交同事考慮，不向客人作硬拒絕。
- 人類客服訊息是每日學習證據，但單次大額訂單例外、價格、退款、停單及承諾不得自動泛化。自動寫入只限答案與既有已發布 FAQ 完全一致的問法／關鍵字。
- WATI `showFile` 是需 Bearer token 的受保護端點，不可直接寄給同事；附件必須私有轉存並以短期 signed URL 分享。
