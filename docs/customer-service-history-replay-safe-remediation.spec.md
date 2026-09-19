# FCCD 歷史對話回放與低風險自動修復：增量開發規格

> 版本：v0.1｜日期：2026-09-19｜狀態：評審稿／未實作、未驗收。  
> 建議路徑：`docs/customer-service-history-replay-safe-remediation.spec.md`  
> 適用專案：`benjaken/fccd`，實作前固定實際分支、commit、工作區及資料庫版本。  
> 基線：2026-09-18 交付的 `FCCD_RAG_All_Fixes_f0b917a.zip` 全部修復，或經核對具備等價行為的版本；不是只有原始 `develop@f0b917a`。

**目的：讓系統以歷史情境找出可重現的回答問題，定位原因，產生受限修復，經回歸驗證後按授權範圍生效。不是以真人舊答案直接改寫 FAQ，也不是讓模型自行修改與部署生產程式。**

本文的「必須」是待實作的驗收要求；預設數值是建議起點，不是已驗證的效能、安全性或成本承諾。

## 00. 給開發 AI 的執行指令

同時閱讀原案例 spec、相容性補充文件及本文件。先唯讀盤點修復包套用狀態、既有評估器、匯入訊息、權限及測試，再提出最小修改計劃。保留原修復；不將歷史回放重新做成另一套 FAQ 生成器。

優先交付「可用的歷史回放＋具體診斷＋修復候選與驗證」。第一期可以實作預授權的索引修復能力，但交付預設不開啟生產自動修復。模型輸出永遠不能自行授權、修改白名單、放寬 guard 或啟用 live。

除非另獲明確授權，不推送 GitHub、不執行 production migration、不改正式設定、不發 WhatsApp、不操作訂單、不批量匯出真人聊天。不覆寫使用者未提交的改動。

### 文件關係

| 文件 | 職責 |
| --- | --- |
| `customer-service-conversation-cases-phase1.spec.md` | 線上案例檢索、應對方式與 composer／fallback 接線。 |
| `customer-service-conversation-cases-phase1.compatibility-addendum.md` | 2026-09-18 修復相容性、B1/B2 基線、全文 guard、受控澄清及 RG01–RG40。 |
| 本文件 | 歷史回放、判定依據、修復提案、隔離驗證、自動動作邊界及發布記錄。 |

本文件補充離線改善流程，不取消案例分表、案例僅作 `response_guidance`、`CUSTOMER_SERVICE_CASES_AUTO_INGEST=false` 等原約束。案例功能尚未上線時，也可以先做不依賴案例的回放。

## 01. 產品決策與最小範圍

| 議題 | 本版建議採用 |
| --- | --- |
| 回放範圍 | 主集合評估 FAQ／資訊解釋／已接線的安全澄清；另建路由安全集合，檢查是否應查工具或轉人，但不執行業務操作。 |
| 判定 | 確定性檢查＋有明確準則的 LLM judge＋不確定及高風險樣本人審。文字相似度只作輔助。 |
| 儲存 | 新建歷史 run、sample、repair proposal 三個邏輯實體；不污染原 model lab 指標。復用已有任務與 audit 能力，不再建通用工作流平台。 |
| 自動修復 | 第一版白名單只允許「恢復已核實、同版本知識的索引」等受控維運動作。相似問、案例及模板改動先產生候選並自動驗證，不自動發布。 |
| 正式知識變更 | 價格、政策、時段、產品、業務流程、承諾及操作權限均須人審。 |
| 開發排序 | 先有可信回放與原因分類，再做修復器，最後才開有限自動生效；不能先讓 judge 自動寫正式資料。 |

用語上區分兩個「現在」：現在的 AI／程式版本，以及現在有效的業務規則。歷史問題的發生時間不會因此變成今天。

## 02. 既有能力與核對界線

依使用者本次核對，`customer-service-model-evaluate` 目前樣本主要來自 `customer_service_test_cases` 及 `customer_service_turn_feedback`，尚未把歷史匯入接成 replay samples。相關符號包括 `answerCustomerServiceFaqForEvaluation`、`ragAnswerTextSimilarity`、`customer_service_learning_import_messages`、`buildHumanLearningPairs`、`buildHumanLearningConversations`、`sanitizeCustomerServiceContextText`；實作前核對真實檔案與簽名。[S3]

整合修復說明已包含共用 production FAQ 子流程評估、baseline 比較、檢索診斷及小批次續跑。這不只是計算「FAQ 有沒有命中」，但仍不等於涵蓋完整 routing、fallback、handoff、業務執行或訊息輸送的端到端回放。[S1 §6–7；S2 §8]

本文件沒有重新讀取 ZIP 內全部原始碼、執行真實模型、跑 migration 或核驗 production。既有行為以交付說明及使用者核對為設計輸入，不將它們冒稱為部署完成證據。

## 03. 目標流程與角色隔離

```text
授權讀取歷史匯入
  → 切分歷史決策點、配對真人回覆、脫敏
  → 建立固定樣本集與範圍標記
  → 固定程式／設定／知識快照
  → 用 production 共用子流程回放（業務副作用禁止）
  → 確定性檢查 + judge + trace 原因定位
  → 產生受限 repair proposal
  → 在隔離候選版本驗證
  → 白名單／預授權 gate 或人工審核
  → 經受控執行器生效、監控、必要時撤回
```

**Evaluator** 只可讀授權資料、呼叫選定模型、寫評估記錄；不可修改正式 FAQ、案例、訂單、設定或發訊息。

**Planner／Judge** 只輸出結構化判定及建議；沒有 SQL、shell、Git push、發布、解除安全限制等權限。`suggested_fix` 是描述，不是可執行程式。

**Repair executor** 是另一個受限制的後端入口，只接受服務端白名單的 `repair_kind`，並驗證目標、來源、版本、授權、預算及冪等鍵。不得把模型自由文字交給資料庫或命令列執行。

「禁止副作用」指禁止客戶／業務／線上知識的副作用；評估任務自己的受控記錄及模型用量仍存在，須有權限與預算。不能只靠 prompt 說禁止，應由注入的 deps、資料庫角色及出口權限實際阻擋。

## 04. 歷史樣本：配對、時間與防洩漏

### 4.1 回放單位是「真人準備回覆前的決策點」

一個 sample 由當時可見的客戶請求與上文，加上對應的真人回覆參考構成。它不是整段聊天，也不是電話號碼下所有訊息。

使用 tenant／品牌／渠道／conversation 或可核實 session 等複合範圍隔離。電話號碼只能是分組訊號之一；同號跨渠道、跨日期或不同事件不可直接串接。缺少 session 證據的片段標記 `pairing_uncertain`，不進自動修復集合。

`buildHumanLearningPairs` 可作候選提取起點，但不可假設它已完整處理下述邊界：連續客戶分句、跨日真人回覆、中間插入 bot 回覆、客服回覆更早問題、多人／多渠道及附件依賴。

### 4.2 必須執行的切分規則

| 事項 | 規則 |
| --- | --- |
| 客戶連續訊息 | 優先沿用 live 的 burst 合併規則形成當前 request，避免只留最後一句「兩位食素」。 |
| Context cutoff | `recentMessages` 只取本次 request 開始前、在該決策點已可見的同會話訊息；當前 burst 只出現在 question 一次。 |
| 真人連環回覆 | 可合併同一回覆 block 的真人多句；遇新客戶 request、其他回覆主體、session 分界或明確轉題即停止。 |
| Bot 插入 | 不把 bot 文字冒充真人 reference；可能改變可見上下文的混合片段須重新切分或標不確定。 |
| 訊息次序 | 按可信事件時間及穩定次序鍵排序；時間相同但無法判先後時不得猜測。保留排序策略版本。 |
| 不完整資料 | 依賴圖片、電話跟進或未匯入資訊而無法理解，標 `context_gap`；不能用模型猜內容。 |
| 去重 | 以來源事件／request message IDs＋context hash 去重；同一句話在不同情境不是必然重複。 |
| 結果 | 後續客戶反應可單獨作 outcome evidence，但不能塞回該題 generator 的上文。未確認結果保持 unknown。 |

分頁提取時須保留必要 lookback，不能因日期篩選從中間開始便假裝沒有上文。跨批去重使用來源指紋，不使用可直接暴露電話的公開 key。

### 4.3 真人答案不得洩漏進生成器

真人本次目標回覆及其之後訊息，只能進 reference／judge，不可進 generator 的 `recentMessages`、rewrite 或 grounding。已在當時發生的更早真人回覆可以作上下文，但仍不自動成為正式政策。

評估樣本如與線上案例、相似問或學習資料共享來源，需要記錄 lineage。發布驗收集合應按原始對話／事件群隔離，排除由測試事件衍生的案例與 alias；做不到就標 `contaminated`，不能當獨立改善證據。一般生產快照的診斷仍可保留，但要與未洩漏的驗收結果分開。

### 4.4 脫敏不是刪除所有數字

復用現有 sanitizer，並補測電話、姓名、電郵、地址、訂單號、付款識別、URL 內 token 及多訊息間同一實體的一致代碼。不能只憑函式名稱宣稱已完整去識別。

評估必要的人數、產品規格、非個人價格及日期應保留其語義和歸屬；一律刪數字會令金額／日期測試失去作用。原始識別值不送 judge、不進一般日誌；映射表受獨立權限控制。使用具密鑰保護的內部指紋，不把可枚舉電話的普通雜湊當充分匿名化。

## 05. 判分基準：真人 reference 不是事實標準

### 5.1 三類資料要分開

| 資料 | 角色 |
| --- | --- |
| `reference_human_answer` | 真人當時實際說法，可用於應對方式、資訊覆蓋及差異比較；未必正確或仍有效。 |
| `authoritative_evidence` | 經核實、與所選時間及範圍一致的政策／FAQ／授權資料快照；支持事實判分。 |
| `expected_behavior` | 經審核的驗收要求，例如應先追問哪個缺少欄位、不得承諾供應、需轉人。 |

Judge 不能只讀模型命中的幾條 FAQ 就判定「知識庫沒有答案」。檢索漏失需要獨立已標註來源，或從同一核實知識快照做更完整的診斷查找。診斷查找結果仍須驗證，不能靠 judge 生成新政策來填補缺口。

### 5.2 明確處理政策與時間變化

首期預設 `evaluation_mode=current_policy_regression`：使用固定的現在程式／設定及當前核實知識，評估歷史提問類型。真人舊答案僅作參考。穩定的一般政策題可判分；日期、供應、訂單狀態等高度依賴當時資料的題目需另判可評估性。

每題保存 `scenario_at`、`context_cutoff_at`、`evaluation_at`、`policy_as_of`、`clock_mode`。相對日期以原情境時間解讀，不把半年前的「聽日」偷偷改成回放執行日的翌日。時間注入不受支援時，該類判定標 `not_evaluable`，不能以現在的服務器時鐘混用。

| 情況 | 判定與處理 |
| --- | --- |
| 舊人答 800；現在正式資料為 900 | 標 `policy_drift` 或 `reference_not_current`；不能因兩者不同就把 AI 改回 800。此為合成示例。 |
| 不知道當時價格或供應 | `insufficient_evidence`／`not_evaluable`，不判定誰錯，不生成事實修復。 |
| 需要驗證真人當年是否答錯 | 必須取得當時有效的正式依據；只有現在政策不足以判 `human_likely_wrong`。 |
| 需評估歷史訂單修改結果 | 留待具備當時工具／資料快照的 historical simulation；不得讀目前生產訂單狀態冒充歷史狀態。 |

`historical_simulation` 留作後續能力，需同時還原當時知識、工具結果、時鐘及權限情境。本版不宣稱已具備。

## 06. 評估範圍與共用 runtime

### 6.1 兩個集合，不以「有沒有命中 FAQ」決定是否入選

**主集合 `answer_quality`**：預期可做資訊解釋、政策問答及已接線的需求澄清。知識應存在但沒有檢索到的題目仍在集合內；若按實際命中過濾，就會把需要修的檢索漏失排除。

**安全集合 `routing_safety`**：如「幫我取消這張訂單」，評估分類、預期工具／轉人選擇與不得假稱完成。只跑可隔離的 routing／plan，不執行真實退款、改單、handoff 或發送。

「退款政策是甚麼」可能是 FAQ；「立即幫我退款」是操作請求。不能只靠退款關鍵字把前者排除，也不能把後者硬餵 FAQ composer。

集合的預期範圍標籤應來自獨立審核或可核實的任務定義，不以被測分類器自己的輸出決定。否則分類錯誤會把失敗題目排除，造成虛高分數；未審核標籤須分開顯示，不進自動發布 gate。

未接好可重用的只讀 routing adapter 時，保留樣本及 `out_of_scope` 原因，不能以假造的 router 回覆報測試通過。路由集合不與 FAQ 回答集合混用分母。

### 6.2 Replay adapter 要實際包含被聲稱評估的路徑

第一期優先復用 `answerCustomerServiceFaqForEvaluation` 與修復後共享 deps。核對它實際是否涵蓋 fallback；若未涵蓋，只新增最小 wrapper，共用 production 的 composer→fallback 子流程及 guard，不另寫模型裸答流程。

對話案例功能存在時，以 run snapshot 固定案例模式；同一題共用案例快照。尚未實作時只跑 B1，不能建立假 `exampleCaseIds` 或假裝測過案例。

必須記錄可觀測 trace：分類、原問題／改寫結果的授權脫敏投影、候選 ID／rank、有效 profile、選用來源、parser／guard 拒絕碼、最終文字與分支耗時。不要求取得模型隱藏推理；以實際輸入、輸出和程式事件診斷。

### 6.3 Run 開始時固定快照

固定 code baseline、effective config、model／endpoint（無 secret）、prompt hash、FAQ／case 內容版本、索引 profile、judge model／rubric、sanitizer／sample builder 版本、樣本指紋及隨機抽樣 seed。

Candidate 與 baseline 使用同一批輸入及正式資料快照；每次 trial 獨立，不能殘留上一次結果。只記可變 record ID 不足以重現，需有不可變版本或受控內容快照。

中途 active config 或知識變更時，不逐題重新讀成不同版本；使用快照，或停止並建立新 run。Provider 版本無法固定時，記錄 `reproducibility=best_effort`，不可聲稱逐字可重現。

## 07. 判定與根因：不讓一個 verdict 代表所有事情

### 7.1 判定順序

先檢查樣本有效性、時間／政策可比性、執行完整性及 side-effect trace。再執行確定性來源／數字／URL／欄位／操作狀態驗證；最後使用 LLM rubric 評估覆蓋、回應策略、語氣與有依據的語义差異。[S4；S5]

Judge 輸入包括問題、可見上文、AI 最終答案、真人 reference、有效正式依據及必要 trace。不得用它自己的世界知識決定店舖政策。雙方文字與來源都視為不可信資料，不得覆寫 judge 規則。

### 7.2 建議內部判定契約

以下為待實作型別，不是既有 API 的宣告。

```ts
type EvaluationJudgment = {
  status: "scored" | "not_evaluable" | "out_of_scope" | "execution_failed";
  comparison: "match" | "partial" | "divergent" | "inconclusive";
  aiGrounding: "supported" | "unsupported" | "conflicting" | "unknown";
  referenceStatus:
    | "supported_for_selected_time"
    | "reference_not_current"
    | "reference_suspect"
    | "unknown";
  issues: Array<{
    category: string;
    severity: "low" | "medium" | "high" | "critical";
    layer: "sample" | "context" | "routing" | "retrieval" | "knowledge"
      | "generation" | "validation" | "rendering" | "infrastructure";
    evidence: Array<{
      sourceType: "ai_answer" | "human_reference" | "approved_source" | "trace";
      sourceId: string;
      quote?: string;
      start?: number;
      end?: number;
    }>;
    suggestedFix: string; // 描述而非可執行程式。
  }>;
  requiresHumanReview: boolean;
};
```

不要強制所有差異只能選一個原因。`match` 也可能是雙方都沒有根據；`divergent` 也可能只是現行政策改變，並不直接等於 AI 錯。`human_likely_wrong` 若保留為 UI 標籤，必須有同時期證據並標人工覆核，不能用來評核客服個人表現。

`missing_info` 要區分三件事：輸入本來缺資訊、上下文遺漏、答案漏講已知資訊。只有後兩者可能是程式／生成問題。建議 issue codes 包含 `context_gap`、`context_dropped`、`missing_coverage`、`retrieval_miss`、`wrong_amount_date`、`wrong_policy`、`wrong_product`、`should_escalate`、`repeated_question`、`unsupported_commitment`、`tone`、`policy_drift`。

### 7.3 引文和 judge 的限制

引文必須對應受控輸入中的真實 span；程式驗證來源、版本與 offset／精確子字串。錯誤 quote 不得成為自動修復證據。經脫敏後仍引用相同投影，不回填 PII。

Judge 需用人工標註的香港繁體／廣東話樣本校準。人／AI 的身份不要被當成權威；可將答案匿名為 A/B，抽樣交換次序。對低信心、高風險或前後判定不一致的項目二次判定或人審。自報信心不是經校準的正確率，兩次模型一致也不是獨立事實證明。[S5；S6]

### 7.4 症狀不等於原因

| 可見結果 | 可能原因 | 對應處理方向 |
| --- | --- | --- |
| AI 沒答，但真人答到 | 索引 stale、FAQ 缺失、scope 不同、guard 拒絕或真人用了未記錄資料。 | 先讀 trace 與正式來源，不直接加 alias。 |
| 金額不同 | 當時政策不同、抓錯品牌、欄位混淆、幻覺。 | 先確定時間／範圍／來源；不自動改價格。 |
| 追問太泛 | 缺受控 slot、上下文解析錯、模板限制。 | 保留 guard，候選修復是受控 slot／模板，不是放開自由澄清。 |
| 客戶已提供日期仍再問 | 當前 context builder 或 missingFields 邏輯錯。 | 生成最小程式修復提案與測試，不能靠改 FAQ 遮掩。 |
| 只有語氣與真人不同 | 兩種有效表達、品牌風格不同或 judge 偏好。 | 不因字面低相似度而改正式事實。 |

## 08. 低風險自動修復矩陣

### 8.1 自動化層級

| 層級 | 動作 | 第一期權限 |
| --- | --- | --- |
| R0：分析與候選 | 分類、聚類、生成修復建議、準備未審核回歸樣本、模擬 candidate。 | 可在授權評估環境自動執行，不改線上行為。 |
| R1：維運恢復 | 對已核實、仍有效、當前 profile 的個別 FAQ／案例重新排入現有 embedding job。 | 通過預授權白名單、版本與預算檢查後可自動；預設未開啟。 |
| R2：局部行為／檢索變更 | 新增相似問、指定意圖的既有受控模板選擇、案例 guidance 候選。 | 自動提案＋隔離驗證；第一期發布仍需人審。未來另批 scope 後才擴大自動生效。 |
| R3：高影響變更 | FAQ 答案、政策、價格、全域 prompt、檢索門檻、model、路由、權限、程式與資料庫結構。 | 不自動發布；可產生最小 diff／PR 草稿，但須人工審查與正常 CI。 |

**核心：安全邊界由執行器白名單決定，不由 judge 的「低風險」標籤決定。**

### 8.2 R1 索引修復的完整前置條件

目標內容必須已核實／授權、仍在有效 scope；不改正文、alias、用途、policy、模型、endpoint、dimension、內容模板或 prompt。以程式狀態確認缺索引／失效／可重試暫時錯誤，而不是只因回答不好就全庫重建。

服務端核對 revision、content hash、embedding profile、claim／lease、retry eligibility 及現有故障碼。已有有效 claim 不搶工作；永久錯誤、profile 轉換不明、正文已改、密鑰／設定錯誤轉 blocked，不反覆 retry。

每個目標與版本有冪等鍵、次數上限與冷卻期；只使用既有受保護 claim／completion RPC。不得直接 DML embedding 表、擅自 force 全庫或繞過 stale 檢查。[S1 §2、4；S2 §5]

恢復索引會影響檢索結果，因此仍需記錄前後狀態與代表性回放，不稱為零風險。若重建後驗收異常，保留安全的 lexical 降級及人工告警，不恢復過期／不合法向量。

### 8.3 R2 候選：相似問與模板不是天然低風險

新增 alias 會改變命中範圍；含省略、否定、品牌或條件差異的問題不能因向量相似就綁到同一 FAQ。候選必須指向明確有效 FAQ revision、保留條件、檢查多 FAQ 衝突及 hard negatives，且不修改該 FAQ answer。

模板候選只可引用既有審核模板／合法 slot；缺新 slot 的修復要走程式審查。案例只提供 guidance，不能透過候選修復取得 grounding 權限。

`CUSTOMER_SERVICE_CASES_AUTO_INGEST=false` 時，案例提案存放在 repair proposal，不自動寫入或啟用正式 case。需要新增主表 draft／active，走既有授權匯入與審核流程。

任何候選內容生效前，都要確認 base revision 仍匹配；人已修改過正文／模板時不得覆蓋。舊 baseline 驗證過的候選不能套到新版本。

### 8.4 不能用來自動修復的訊號

LLM 自報高信心、同一 Q&A 出現兩次、真人常用同一句、文字相似度提高、同一 judge 前後給較高分，均不能單獨授權正式變更。不得自動學一次性讓步，不把 judge 生成的答案冒充已核實 FAQ。

## 09. 修復提案、隔離驗證與發布

### 9.1 結構化修復提案

每個 proposal 保存：`repair_kind`、`target_type/id`、scope、base revision/hash/profile、白名單版本、來源 sample IDs、原因與證據、candidate patch、風險層級、驗證結果、審核／預授權記錄、執行與撤回記錄。

狀態建議：`proposed → validating → ready → applying → applied`；旁路有 `blocked`、`rejected`、`failed`。可撤回的行為變更另有 `rolled_back`。不能因 judge 回 `match` 便跳到 applied。

R1 由確定性 predicate 驗證後排入受控工作，再做 completion 與事後檢查；不必為每次正常暫時錯誤重試建立一輪 LLM 自我修改。R2 需先跑隔離 candidate gate。

### 9.2 候選不可直接用正式資料「邊改邊測」

候選以隔離的評估資料版本／schema 或已存在的版本化 overlay 實作。必須使用等價 production retrieval／guard 行為，不能人工指定「目標 FAQ 永遠第一名」讓測試假通過。

若目前沒有安全的隔離索引與版本能力，先交付提案及可重現測試，禁止在 production 套 alias 後再決定是否保留。不能為本功能順便開新平台或複製全部客戶資料。

### 9.3 R2 的最低驗證 gate

需同時通過：原錯誤樣本改善、其他已通過樣本不退化、同品牌／其他品牌與否定條件的 hard negatives、安全測試、獨立來源的 holdout，以及成本／時延預算。每次只改一個可歸因的小目標。

失敗樣本及其自動改寫屬 repair/development set，不是獨立 holdout。候選生成器不可讀 holdout 的標準答案；重複查詢同一 gate 也可能過度適配，需限制嘗試次數與定期更新封存測試。[S4；S5]

關鍵情境做多次 trial，而非挑最好一次。硬安全失敗不得被平均分掩蓋；P0 新增失敗為零是測試要求，不代表生產零風險。小樣本不足以證明改善時維持待審，不依任意百分比自動放行。

### 9.4 發布與撤回

R1 可在明確預授權 scope 內執行；R2 第一版需人審。生效前以 CAS／等價交易驗證 base revision；實際執行人／服務身份、變更與檢查結果均可稽核。

自動撤回只限本系統剛發布、仍可確認版本與 ownership 的局部行為變更，且須事先授權。不得覆蓋之後的人手編輯、撤回全域模型或恢復已失效政策。索引修復失敗應維持安全失效／降級，不復活舊向量。

把任何修復改成正式答案、正式政策、已批准案例，或擴大 auto_apply 範圍，都需要獨立的授權／審核決定。

## 10. 資料模型與任務完整性

### 10.1 新增三個邏輯實體

以下是邏輯 schema；實際 ID 型別、JSON schema、RPC／RLS 及現有 audit 能力於開發前核對。

| 實體 | 最小資料 |
| --- | --- |
| `customer_service_history_eval_runs` | run/group ID、baseline/candidate、資料集 hash、模式與範圍、程式／模型／prompt／知識快照、有效開關、budget、開始／結束、planned/processed/skipped/failed/scored 數、cursor、完成狀態及 `complete_sample_set`。 |
| `customer_service_history_eval_samples` | run ID、來源 group/fingerprint、trial index、question/context/ref 脫敏快照、cutoff／scenario 時間、pairing validity、當前判分依據、AI 最終答案、observable trace、judge rubric/version、judgment、人工覆核及 lineage。 |
| `customer_service_repair_proposals` | 修復 kind／scope／target、base hashes、來源 samples、候選差異、授權、隔離驗證 run IDs、狀態、冪等鍵、執行／撤回記錄與原因。 |

Sample 結果按 run、來源指紋、trial 唯一；重新生成或更換 judge 不靜默覆寫舊結果。人工覆核保留原 judge 結論與更正理由。可使用 append-only audit 或既有版本化機制，沒有 audit 能力時須補最小事件記錄，不靠一個可覆寫狀態欄稽核。

### 10.2 固定樣本清單再分批執行

先固定 run 的 sample manifest，再排 batch。來源表中新插入訊息不能改變已開始 run 的分頁與樣本總數。批次具 claim、lease／重試及冪等保護，避免 UI 重按或 worker 重啟造成重複計分。

保留既有評估預設 5、上限 10 的小批契約，run 的 `sample_size` 是總抽樣量，不是每次請求一次全跑。取消／預算耗盡／deadline／provider 故障都保留可續跑狀態，不標整套成功。[S1 §6；S2 §8]

## 11. 回歸樣本提升：不可直接 expected_answer = 真人答案

原始 `reference_human_answer` 保留為證據。需要提升為正式 regression 時，先確認範圍、所選時間政策、有效來源與預期行為，產生人工可審的 `expected_assertions`／`expected_behavior`；`expected_answer` 只能是經核對後的其中一個合理答案，不是必須照抄的字串。

例如「已知日期不再重問」「不得無依據承諾免費改期」「有有效條件政策時保留條件」，通常比要求模型重複真人某一句更有用。[S4]

可以自動建立未審核的回歸候選；若 `customer_service_test_cases` 沒有 draft／approved 隔離能力，先保存在 proposal，不直接插入成正式 golden case。自動建立測試資料不等於其 expected 已可信。

保留 `expected_faq_ids=NULL`＝未標註、`[]`＝預期無 FAQ 的原語義。只有已標註的相關 FAQ 才可計算對應 recall；未標註顯示 N/A，預期空集合另報誤命中率，不以除以零或假 100% 美化數據。[S1 §6；S2 §8]

## 12. 旗標、成本與資料安全

### 12.1 建議新增旗標

```text
CUSTOMER_SERVICE_HISTORY_EVAL_ENABLED=false
CUSTOMER_SERVICE_AUTO_REPAIR_MODE=off|propose|apply_allowlist
CUSTOMER_SERVICE_CASES_AUTO_INGEST=false
```

上述是新增設計，非宣稱現有程式已支持。首批開發／staging 可明確啟用評估與 propose；production 開啟 apply_allowlist 必須有目標種類、範圍、額度、owner 及審核記錄。

| 條件 | 規則 |
| --- | --- |
| HISTORY_EVAL_ENABLED=false | 不開始新回放；已在執行的工作按受控取消／暫停規則處理，不再排新模型呼叫。 |
| AUTO_REPAIR_MODE=off | 可以做已授權評估；不生成新的自動修復工作、不執行修復。 |
| AUTO_REPAIR_MODE=propose | 只寫提案與隔離驗證記錄，正式知識、索引及設定不變。 |
| AUTO_REPAIR_MODE=apply_allowlist | 僅 R1 白名單且有預授權的範圍可自動執行；R2/R3 不因此取得發布權限。 |
| RAG_FORCE_OFF=true | 保留修復後 FAQ 抑制行為；案例包括 shadow 關閉。本版另外抑制自動生效修復並記錄原因，不改寫原設定；授權人手 FAQ 回填不受此新增限制。 |
| CASES_MODE=off | 只是不使用線上案例；不禁止另經授權的歷史評估，也不代表可自動匯入案例。 |
| 旗標非法／role 不符／base 版本不符 | 拒絕相應新動作並告警，不能猜測放行。 |

隔離評估 candidate 功能必須走與 production 相同的旗標解析；不能在 production 用 request 參數繞過 FORCE_OFF。必要的候選功能測試在授權隔離環境設定，不冒稱為現行 active 表現。

### 12.2 成本不是固定每題兩次模型呼叫

總用量包括可能的分類、rewrite、embedding、composer、fallback／tier escalation、judge、二次判定、candidate 及 baseline 重跑。應按實際 trace 計量，不能固定估成「1 次生成＋1 次 judge」。[S1 §6；S2 §4、8]

設置 run 總 token／金額預算、sample_size、每 batch deadline、並行度、每階段 retry 上限及修復嘗試上限。樣本無效、缺快照、已確定越權或 provider 失敗的題目先以規則分類，無需每題一律呼叫 judge。

可快取相同 input/config/corpus/sanitizer/model 快照的結果；judge rubric 變了只重判時也要保存新版本。發現 source 被撤回、PII 清除或快照失效時清除相應可用快取。跨環境／tenant 不共用含內容快取。

### 12.3 權限與保存

評估三表及 source link 只限內部授權人員。UI 顯示脫敏投影，回查原始對話必須另外驗證權限。資料庫／服務端限制 environment、brand 與 tenant，不接受模型自由指定範圍。

回放片段和 judge 引文也屬受控資料；沿用既有保留政策並記錄 retention。來源刪除／撤權時，依 lineage 停用樣本／提案，清除內容與快取，保留不含被刪內容的必要 audit 記錄。不可讓 export 或一般日誌成為繞過清除的副本。

## 13. UI 與指標

在「AI 成效報告 → 歷史對話學習」新增「歷史回放評估」。可以復用 model lab 的視覺及任務元件，但結果來源與分母分開，不覆寫既有評分。

Run 頁顯示選定期間、主／路由集合、固定模型與知識版本、政策時間模式、來源是否完整、樣本量、預算及執行進度。提交執行前顯示「不發送訊息、不執行訂單操作」及實際模型成本可能性。

逐題頁並排展示：歷史問題／上文、真人 reference、AI 最終答案、有效正式依據、差異與可觀測 trace。明確標註 reference 不等於 golden；政策變更、資料不足、檢索故障與 AI 回答錯誤使用不同類別。

修復區顯示 target、before/after、根因、白名單／人審狀態、回歸結果、影響 scope、版本及撤回方式。沒有證據支持的提案只可標為 hypothesis，不能顯示「已修好」。

| 指標 | 語義 |
| --- | --- |
| 可評估比例／資料缺口 | eligible、not_evaluable、out_of_scope、pairing_uncertain 分別報數；不能只挑容易樣本後宣稱整體能力。 |
| 回答品質 | 有依據正確性、資訊覆蓋、合理澄清、不重問、語氣分開評分。 |
| 路由安全 | 應查工具／應轉人的選擇與禁止動作，不宣稱已完成真實操作。 |
| 檢索 | 已標註 FAQ 的 recall、誤命中、stale／provider／DB 故障，保留既有定義。 |
| Judge 品質 | 人工覆核一致性、inconclusive 比例、位置交換不一致、高風險誤判樣本。 |
| 修復效果 | 提案數、R1 恢復成功、R2 待審、獨立驗證改善、既有題目退化、發布／撤回。 |
| 執行成本 | 各階段模型／token／time、partial runs、重試與预算耗盡。 |

## 14. 開發工作包

| ID | 輸出與依賴 |
| --- | --- |
| HR-01 基線核對 | 核對 B1 修復、原 ADD／RG 要求、目前 evaluator 真正覆蓋路徑、訊息 ID／會話欄位、sanitizer、case／alias lineage 及權限；列未知項。 |
| HR-02 歷史樣本 | 來源 adapter、decision-point 切分、burst／reply block、cutoff、脫敏、去重、時間／scope 標記；建立固定 sample manifest。 |
| HR-03 回放任務 | 三個實體的 additive schema／RLS、run snapshot、小批續跑、租約、shared FAQ／必要 fallback wrapper、forbidden deps。 |
| HR-04 判定與診斷 | 確定性 checks、judge rubric/runtime schema、引文驗證、root-cause trace、人工覆核與分開指標。 |
| HR-05 提案與隔離驗證 | 受限 repair kinds、版本化 candidate、development／holdout 分割、before/after 比較；不改 production。 |
| HR-06 R1 執行器 | 預授權白名單、CAS、冪等、retry budget、受保護回填入口與前後驗證；預設關閉。 |
| HR-07 UI／發布交付 | 逐題對比、正式依據、完整性／成本、提案審核、發布／撤回、分層測試報告。 |

HR-01 至 HR-04 可先獨立交付有用評估能力。HR-05/06 不依賴自動啟用真人案例；不得為了「自動修復」把先前停用的學習入口打開。新測試沿用既有依賴；不為本 spec 私自更換框架或 provider。

## 15. 32 項驗收要求

以下全部為待實作測試，不是已通過聲明。與 B1 原測試、案例 AC01–AC22、相容性 RG01–RG40 合併按實際涉及範圍執行；尚未實作的案例路徑標 not_applicable，不能虛報通過。

| ID | 情境 | 必須結果 |
| --- | --- | --- |
| HR-AC01 | 只有 B0 或只套部分修復包。 | 基線報告列明差異，不宣稱 B1 等價；保護未提交修改。 |
| HR-AC02 | 客戶連發「30 位」「兩位食素」。 | question 保留整個合法 burst，context 不重複帶同批訊息。 |
| HR-AC03 | 同電話跨渠道／品牌／session。 | 不串成同一對話；不確定配對排除自動修復。 |
| HR-AC04 | 真人連發數句，中間插入新客戶問題或 bot。 | 只合併同一 reply block，不偷接後續答案。 |
| HR-AC05 | 目標真人答案與後續客戶訊息存在來源表。 | 不進 generator／rewrite／grounding，只能作 reference 或獨立 outcome。 |
| HR-AC06 | 日期篩選從會話中途、附件未匯入。 | 有 lookback 或標 context_gap；不得假裝完整。 |
| HR-AC07 | 樣本已衍生線上 case／alias。 | 驗收隔離其 lineage 或標 contaminated；不計為獨立改善。 |
| HR-AC08 | 舊 reference 價格與現在正式資料不同。 | policy_drift／reference_not_current，不自動改價格、不直接判真人當年錯。 |
| HR-AC09 | 歷史「聽日」及現在 runtime 時間。 | 使用明確 scenario clock；不支持就 not_evaluable。 |
| HR-AC10 | 「退款政策」與「幫我退款」。 | 分別做政策回答及 routing safety；後者無真實退款／handoff 呼叫。 |
| HR-AC11 | 應有 FAQ 但完全無檢索命中。 | 樣本不被 scope filter 隱藏；區分 retrieval_miss／knowledge_gap／infra 故障。 |
| HR-AC12 | composer null，現有 evaluator 未接 fallback。 | wrapper 實際覆蓋後才報測過；不寫另一套模型裸答。 |
| HR-AC13 | run 中途 active config／正文更改。 | 固定快照或終止重開，不混用版本。 |
| HR-AC14 | AI 與真人文字相同但無依據；或不同但 AI 合現行政策。 | comparison 與 grounding 分開，不用相似度決定正確性。 |
| HR-AC15 | Judge 捏造 quote／source ID，或來源內要求忽略規則。 | span／來源驗證失敗，不准修復；不執行注入內容。 |
| HR-AC16 | 問句夾帶免費政策，或以 V2 answer 繞過澄清限制。 | 延續 B1 全文 guard／受控澄清，不為對齊真人 reference 而放寬。 |
| HR-AC17 | 中文數字、相同數字不同欄位、已完成操作。 | 依有效來源／狀態判分；未確認的高風險不能只靠 token 通過。 |
| HR-AC18 | Judge 信心高但缺正式依據／結論不一致。 | inconclusive 或人審，不生成可自動發布的事實修復。 |
| HR-AC19 | 已核實同版本 FAQ 暫時回填失敗。 | 只有 R1 預授權時重排受控 job，revision/profile/token 驗證保留。 |
| HR-AC20 | FAQ 已改、永久錯誤、有效 lease 或 profile 更換。 | 不盲目重試／搶 claim；不直接寫向量、不全庫 force。 |
| HR-AC21 | 模型建議改價格、門檻、prompt 或 SQL。 | executor 白名單拒絕，僅保存審核提案；judge 無發布權限。 |
| HR-AC22 | AUTO_INGEST=false，但判定出優秀真人案例。 | 提案留在修復區，不自動寫入／啟用正式 case。 |
| HR-AC23 | Alias 候選只在原錯誤題改善，否定／他品牌錯答增加。 | 回歸 gate 阻擋；不自動發布。 |
| HR-AC24 | Candidate 需要檢索驗證，但沒有隔離索引。 | 不在 production 邊改邊測；列能力缺口。 |
| HR-AC25 | 發布前目標 revision 已被人修改。 | CAS 失敗，不覆蓋；重新驗證／審核。 |
| HR-AC26 | 自動撤回時已有之後的人手改動。 | 不覆蓋人手版本、不復活 stale 向量或舊政策。 |
| HR-AC27 | 將 divergent 樣本提升為 regression。 | 先核對 expected behavior／正式依據；未審核不能直接真人原答當 golden。 |
| HR-AC28 | expected_faq_ids=NULL／[]、含 case ID。 | 保留原語義，無標註 N/A，case 不污染 FAQ 指標。 |
| HR-AC29 | 同批重按、worker 重啟、部分樣本 provider 失敗。 | 去重／續跑、不重計；complete_sample_set 與 failed/skipped 明確。 |
| HR-AC30 | HISTORY_EVAL／AUTO_REPAIR／FORCE_OFF／CASES_MODE 組合。 | 符合本版矩陣；不繞過原抑制／guard，不妨礙獨立授權的人手 FAQ 回填。 |
| HR-AC31 | 單題走 rewrite＋fallback＋judge 二判，超出 budget。 | 按實際各階段計量與中止，不假設只兩次呼叫；結果為 partial。 |
| HR-AC32 | PII、來源撤權、日誌／匯出及修復前後報告。 | 脫敏一致、限權清理 lineage；區分 mock／實測／未測，無假安全／效能結論。 |

## 16. 交付與發布順序

交付：基線報告、實際檔案／migration 清單、歷史樣本與時間模型說明、judge rubric 及校準樣本、修復白名單、驗收矩陣、成本／進度與錯誤呈現、部署／停用／撤回手冊。

發布建議：本地／隔離測試 → 授權 staging 歷史回放 → 人工校準 judge → propose 模式觀察 → 極少量、明確目標的 R1 預授權 → 監控／回歸；R2 正式生效另經人審。沒有 production 權限或驗證，交付維持未部署。

不能用「與真人越來越相似」作唯一成功條件。完成定義是：歷史輸入可重現、錯誤和資料缺口分得開、修復可解釋可驗證、白名單外不能執行、原修復不退化。

## 17. 來源與證據範圍

| 代號 | 來源 | 使用範圍 |
| --- | --- | --- |
| S1 | `/FCCD/README.zh-HK.md`，《FCCD RAG 修復整合包》，2026-09-18-v1；本次對話已讀全文。 | B1 七類交付修復、回填／索引契約、共享評估、批次、指標與未驗證限制。 |
| S2 | `customer-service-conversation-cases-phase1.compatibility-addendum.md`，v1.0，2026-09-19；本次重新讀取全文。 | B1/B2 基線、全文 guard、受控澄清、旗標、學習隔離及 RG01–RG40。 |
| S3 | 使用者本次提供的歷史回放方案與現況核對。 | 匯入／評估來源、函式名稱、judge／UI 提案及低風險自動修復目標；不當作獨立 production 驗證。 |
| S4 | Anthropic, “Demystifying evals for AI agents”，2026-01-09；查閱 2026-09-19。 | 混合 grader、環境隔離、任務與回歸分開、unknown、trace 與人工校準原則。 |
| S5 | OpenAI, “Evaluation best practices”；查閱 2026-09-19。 | 明確準則、任務特定評估、工具／handoff 評估、judge 校準與偏差。只借鑑評估方法，不要求採用其平台。 |
| S6 | Zheng et al., “Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena”，arXiv:2306.05685；查閱 2026-09-19。 | Judge 的位置、篇幅與自我偏好限制；不把研究中一致率當成 FCCD 可達指標。 |

外部來源：

- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://developers.openai.com/api/docs/guides/evaluation-best-practices
- https://arxiv.org/abs/2306.05685

本文件是原創增量設計建議，未修改前兩份文件、產品程式或正式資料。新增 schema、旗標、工作包及 HR-AC01–HR-AC32 都尚待實作與驗收。
