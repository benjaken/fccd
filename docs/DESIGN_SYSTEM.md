# FCCD Design System

FCCD（**Food Channel Catering Discovery**）自有設計規範：以 **shadcn/ui（New York + CSS variables + CVA）** 為元件與 token 基礎，
吸收 **Ant Design** 的企業後台密度、操作層級、回饋與資料展示節奏，再疊加本專案已拍板的
品牌與營運規則。

配套文件：

- 實作細節／已拍板規則：[`UI_DEVELOPMENT_STANDARD.md`](UI_DEVELOPMENT_STANDARD.md)
- 營運列表表格：[`UI_TABLE_STANDARD.md`](UI_TABLE_STANDARD.md)
- 產品需求對照：[`API_FUNCTIONAL_PRD.md`](API_FUNCTIONAL_PRD.md) §9

---

## 0. 設計來源對照

| 來源 | 採用什麼 | 不直接照搬什麼 |
|---|---|---|
| **shadcn/ui** | 語意化 CSS variables、`Button` variants（CVA）、Radix Slot／可及性、Lucide 圖示、可擁有原始碼的元件 | 預設 zinc／中性主題色、行銷向大留白、把 shadcn 當黑盒依賴 |
| **Ant Design** | 8px 節奏、控制尺寸（sm／md／lg）、主／次／危險操作層級、表格密度、明確 loading／empty／error、表單標籤與校驗回饋 | 引入整個 `antd` 套件、Ant 預設藍 `#1677ff` 色票、過度依賴 Modal 堆疊 |
| **FCCD** | 綠色品牌主色、主按鈕白字、全寬內容區、訂單進度多色、繁中優先 i18n、Light／Dark | 品牌紅主色、頁面 `max-width: 1600px`、預覽一鍵登入用於 Production |

**一句話定位：** 企業營運後台要「看得清、點得準、回饋夠」，元件要「可擁有、可組合、可主題化」。

---

## 1. 設計原則

1. **Operational clarity（營運清晰）**  
   先讓廚師、文員、司機、財務看懂狀態與下一步，再談裝飾。借 Ant Design 的「確定／清晰」。

2. **Own the primitives（擁有元件）**  
   元件原始碼在 `src/components/ui/`（shadcn 模式）。需要行為時改源碼或加 CVA variant，不要包一層難維護的第三方主題黑盒。

3. **Semantic tokens first（語意 token 優先）**  
   使用 `--primary`、`--destructive`、`--muted-foreground` 等語意色，禁止在業務頁面散落硬編碼色值（狀態多色圖表除外，見 §3.3）。

4. **Hierarchy of action（操作層級）**  
   同一視窗通常只有 **一個** 實心主按鈕（Primary）。其餘用 Outline／Secondary／Ghost／文字按鈕。借 Ant Design 的主次分明。

5. **Feedback is a state, not a surprise（回饋是狀態）**  
   Loading、Empty、Error、Success、Permission denied 必須可預期，並留在同一面板／頁面骨架內（見表格標準）。

6. **Dense but breathable（密而不擠）**  
   營運列表採 Ant Design 式資訊密度；頁面外圈維持統一 `28px` 邊距（FCCD），避免 shadcn 展示站那種過大行銷留白。

7. **Accessible by default（預設可及）**  
   可見 focus ring、鍵盤可操作、對比符合 WCAG AA；主色按鈕必須白字。尊重 `prefers-reduced-motion`。

---

## 2. 基礎（Foundations）

### 2.1 色彩 Color

來源：`src/index.css` 的 `:root` / `.dark`。

| Token | 用途 | 規則 |
|---|---|---|
| `--primary` | 主操作、品牌強調、focus／active 相關 | 中等飽和綠；約 `oklch(0.52 0.14 150)`（light） |
| `--primary-foreground` | 主色實心底上的文字／圖示 | **必須近白**；禁止深色內文壓在綠底上 |
| `--secondary` / `--muted` | 次要底、軌道、弱資訊 | 低彩度、與 primary 同色相的中性 |
| `--accent` | 輕量強調底 | 與 primary 同色相、低彩度 |
| `--destructive` | 刪除、失敗、危險 | **保持紅色**，不跟品牌綠混用 |
| `--border` / `--input` / `--ring` | 邊框、表單框、focus | ring 跟隨綠系 |
| `--background` / `--card` / `--foreground` | 頁面／卡片／內文 | Light `--card` 用 `oklch(1 0 150)`（chroma 0 仍保留綠相，避免 OKLCH mix 漂向粉紅） |

**借 Ant Design 的功能色分工（映射到本系統）：**

| 語意 | FCCD 做法 |
|---|---|
| Primary | `--primary` 綠 |
| Success | 綠系 tone／badge（如 `tone-green`、status green；可與品牌綠接近但進度條仍須多色） |
| Warning | 琥珀／琥珀 badge（`tone-amber`） |
| Error | `--destructive` |
| Info | 青／靛／資訊藍（`tone-cyan` / `tone-indigo` / `.status-badge.blue`） |

Active 導航（側欄、工作區 soft link、migration tab）必須是**淡綠底 + 綠字**，使用 `--nav-active-bg` / `--nav-active-fg`（明確綠相，約 hue 150），禁止粉紅／舊品牌紅／舊藍殘留。  
`.status-badge.red`／`.metric-icon.red` 只代表危險／失敗（`--destructive`），不可再當舊品牌主色；品牌強調改用 `--primary`（綠）。

**多狀態進度條**不可全部使用品牌綠，必須用可區分色相（見
[`UI_DEVELOPMENT_STANDARD.md`](UI_DEVELOPMENT_STANDARD.md) §3）：

`indigo` → `amber` → `violet` → `cyan` → `green`。

### 2.2 字體 Typography

| 層級 | 建議 | 說明 |
|---|---|---|
| Page title (`h1`) | `clamp(25px, 2.3vw, 34px)`、重字重 | 對應 Ant Design 頁標題；一頁一個主標題 |
| Section / panel title | 約 16–18px、偏重 | 面板標題，短句 |
| Body | 14px | 營運後台預設閱讀尺寸（Ant 中密度） |
| Meta / helper | 12–14px、`--muted-foreground` | 說明、時間、次要欄位 |
| Eyebrow | 小寫距大寫／品牌色 | 區塊眉題，不壓過品牌 |

字型堆疊維持現有：`Inter, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui`。  
文案一律走 `src/i18n.ts`，預設 `zh-HK`。輸入框 placeholder 同樣走獨立 `*Placeholder` i18n key；中文 locale 不得使用英文提示。

### 2.3 間距 Spacing

採 **8px 節奏**（Ant Design），並固定 FCCD 頁面邊距：

| Token 概念 | 值 | 用途 |
|---|---|---|
| Space XS | 4px | 圖示與文字微距 |
| Space SM | 8px | 緊湊堆疊 |
| Space MD | 16px | 預設區塊內距 |
| Space LG | 24px | 區塊之間 |
| **Page gutter** | **28px** | `.main-content` 四周（FCCD 拍板） |
| Panel padding | 18–20px | 卡片／面板內容 |

禁止再加頁面級 `max-width: 1600px`；內容全寬，邊距靠 gutter。

### 2.4 圓角、邊框、陰影 Radius / Border / Elevation

借 shadcn radius token + Ant Design 克制陰影：

| 元素 | 規則 |
|---|---|
| 控制項（按鈕、輸入） | 約 `rounded-lg`／11px，一致 |
| 面板／卡片 | 約 14–16px |
| 進度條／pill | 全圓角 |
| 陰影 | 輕量、低對比；主按鈕可用淡綠陰影，避免多層霓虹 glow |
| 邊框 | 優先 `1px solid var(--border)`，靠層級而非重陰影區分 |

### 2.5 尺寸 Size（控制高度）

對齊 Ant Design 的 sm／middle／large，映射 shadcn `Button` size：

| 尺寸 | 高度 | 使用場景 |
|---|---|---|
| `sm` | 36px（`h-9`） | 工具列次要操作、表格列內 |
| `default`（middle） | 40px（`h-10`） | **預設**頁面操作 |
| 表單強調／登入 | 46–48px | 登入提交等少數場景 |
| `icon` | 40×40 | 僅圖示按鈕 |

同一工具列內尺寸必須一致。

### 2.6 動效 Motion

借 shadcn 克制過渡 + PRD 要求：

- 頁面切換：短促 opacity／transform（現有 `page-enter`）
- 進度條寬度：可動畫；不阻擋操作
- `prefers-reduced-motion`：關閉非必要動畫
- 動畫結束 **不是** 資料完成條件

---

## 3. 佈局 Layout

### 3.1 App shell（已定）

- 頂欄：品牌、工作區 soft links、語言／主題／使用者
- 側欄：二級導航，可收合
- 主區：全寬 + `28px` gutter + page header（eyebrow／標題／主操作）

參考 PRD UX-09～UX-15；細節以現有 `app-shell`／`topbar`／`sidebar`／`main-content` 為準。

### 3.2 頁面結構（借 Ant Design Pro 資訊架構）

每個營運頁建議順序：

1. **Page header**：眉題 + 標題 + 描述（可選）+ 主操作（右側）
2. **Toolbar**：搜尋、篩選、次要操作
3. **Content**：面板／表格／表單
4. **Footer area**（列表）：分頁固定在面板底部

一屏一個主任務；不要把儀表板小卡塞進列表頁第一視窗。

### 3.3 響應式

- 桌面：側欄 + 高密度表
- 窄螢幕：drawer／堆疊工具列；**不要**把桌面表硬縮成不可用寬度（PRD UX-06）
- 觸控目標至少約 40px 高

---

## 4. 元件規範 Components

元件優先放在 `src/components/ui/`，以 shadcn 方式擴充（CVA + `cn` + Slot）。

### 4.0 組件化硬規則（必遵）

**多頁共用、或功能相同／高度相似的 UI，必須封裝成共用組件，禁止在各頁面複製貼上同一套 markup／樣式。**

| 規則 | 說明 |
|---|---|
| 先找再造 | 新增輸入框、搜尋列、分頁、表格骨架、列表狀態等之前，先查 `src/components/ui/` 與既有列表頁 |
| 兩處即抽 | 同一視覺／互動模式出現在 **≥2 個頁面**（或明顯將複用）時，必須抽到 `src/components/ui/`（或明確的領域共用目錄），並改為引用組件 |
| 頁面只組裝 | 列表頁負責資料與篩選狀態；搜尋框圖示位置、提交按鈕、骨架列結構等通用外觀由共用組件負責 |
| 改一處生效 | 調整通用搜尋／表格行為時改組件與 token／CSS，不要只改單一頁面造成漂移 |
| 文件同步 | 新增或提升為共用組件時，更新本節「實作對照」與相關標準文件 |

**已封裝、必須優先使用的營運列表組件：**

| 組件 | 路徑 | 用途 |
|---|---|---|
| `SearchField` | `src/components/ui/search-field.tsx` | 框內放大鏡的通用搜尋輸入 |
| `ListSearchBar` | `src/components/ui/list-search-bar.tsx` | 列表工具列：搜尋欄 + 搜尋按鈕；移動端保留輸入框，篩選改由右側圖示打開側欄 |
| `DateRangePicker` | `src/components/ui/date-range-picker.tsx` | 開始–結束日期：單一「日期範圍」欄，起迄同一列 |
| `SidePanel` | `src/components/ui/side-panel.tsx` | 右側滑出面板（列表篩選等） |
| `ListTable` | `src/components/ui/list-table.tsx` | 分頁營運列表共用表格外殼、表頭、載入骨架與移動端下拉重新整理 |
| `PullToRefresh` | `src/components/ui/pull-to-refresh.tsx` | 移動端表格下拉重新整理 |
| `TableSkeletonRows` | `src/components/ui/table-skeleton.tsx` | 表格載入骨架列 |
| `PageSkeleton` | `src/components/ui/page-skeleton.tsx` | 所有頁面級骨架；用 `variant` 配置權限、詳情、Dashboard、卡片、表格、報表及分析佈局 |
| `TablePagination` | `src/components/ui/table-pagination.tsx` | 底部分頁 |
| `OperationalListState` | `src/components/ui/operational-list-state.tsx` | 列表空／錯／權限等面板狀態 |

**禁止：** 在訂單／報價／產品／設定等列表頁各自手寫 `.orders-search` + `Search` 圖示 + `<input>` 組合；應使用 `ListSearchBar`（內部已用 `SearchField`）。

### 4.1 Button 按鈕

**Variants（現有 + Ant 語意對照）：**

| FCCD / shadcn | Ant Design 對照 | 何時用 |
|---|---|---|
| `default`（Primary） | primary | 頁面唯一主行動：建立、儲存、送出 |
| `outline` | default | 次要行動：匯出、重新整理 |
| `secondary` | default（弱） | 工具列弱操作 |
| `ghost` | text | 工具列圖示、低強調 |
| `destructive` | danger | 刪除、不可逆 |

**硬規則：**

- Primary 實心＝綠底 **白字／白圖示**（含 `Button asChild` + `<Link>`）
- 同一 header 只放一個 Primary
- 主按鈕文案用動詞：建立、儲存、送出；避免「確定」過於空洞（Ant 文案建議）
- 禁用态用 `disabled` + 降低透明度，並保持可讀原因（tooltip／helper）

### 4.2 表單 Form

借 Ant Design 表單節奏 + shadcn 輸入外觀：

- 標籤在欄位上方（營運後台預設），文案走 i18n
- **Placeholder 必須獨立 i18n key**（名稱以 `Placeholder` 結尾），禁止在 JSX 硬編碼，也禁止把欄位標籤拿來當 placeholder。預設 `zh-HK` 用繁中或「例如：…」；不要把英文 Bubble 原文（如 `Product Name`、`Choose some options...`）放進中文 catalog。`en-GB` 才用英文 placeholder
- 校驗錯誤：欄位旁／下方短訊 + 必要時頂部摘要（PRD UX-07）
- 必填在標籤標示；送出中按鈕進入 loading／disabled，防重複提交
- 輸入高度與 middle 按鈕對齊；focus 使用 `--ring`
- 密碼、電郵等使用正確 `autoComplete`／`inputMode`
- 開始／結束日期必須用 `DateRangePicker`：一個可見標籤（日期範圍）+ 同一列的起迄輸入，不要兩個獨立 DatePicker 上下堆疊。年度報表篩選可繼續用年份 `<select>`
- 報表店舖／供應商 chip 在移動端保持單行矮膠囊（約 36px），不要拉成佔滿半格的高膠囊

### 4.3 資料展示 Data display

| 模式 | 規範 |
|---|---|
| 營運表 | 遵守 [`UI_TABLE_STANDARD.md`](UI_TABLE_STANDARD.md)：15 筆／頁、sticky header、面板內捲動、底部分頁（移動端摘要與頁碼同一行）；**載入中用表格骨架列**，不用整面 spinner |
| 列操作（最後一欄） | **橫向單行**；常用動作（編輯、改密碼等）用 **icon-only** + `aria-label`；禁止 icon+文字按鈕垂直堆疊把列高撐高 |
| 狀態徽章 | 語意色短標籤；成功綠、警告琥珀、危險紅、資訊藍／青 |
| 描述列表 | 標籤弱色、值主色；適合詳情頁 |
| 空狀態 | 說明「為什麼空」+ 一個主行動（若有權限） |
| 數字／貨幣 | locale 格式化；HKD、`Asia/Hong_Kong` |

### 4.4 回饋 Feedback

借 Ant Design 的 Message／Notification／Modal 分層，映射到 FCCD：

| 層級 | 用途 | 做法 |
|---|---|---|
| Inline | 表單欄位、面板內錯誤 | `role="alert"`、面板內 retry |
| Toast／輕提示 | 短成功、非阻斷 | 若新增，需支援 Dark／i18n／reduced motion |
| Dialog／Modal | 確認刪除、不可逆 | 危險操作用 destructive；焦點陷阱與 Esc |
| Result／整頁 | 無權限、致命錯誤 | 清楚說明 + 返回／申請權限 |

**列表頁**的 loading／empty／error／retry／permission 必須留在同一固定面板內，不要整頁跳走。

### 4.5 導航 Navigation

- 工作區 soft links、側欄 active state 明確
- 移動端漢堡選單把一／二／三級目的地收成**同一份清單**（可有分組標題，但不要再套一層抽屜或側欄）
- 麵包屑／上下文只在有層級時出現
- 連結繼承色時，不可破壞 Primary 按鈕白字（見 `a.bg-primary` 覆蓋規則）

### 4.6 圖示 Icons

- 統一 **Lucide**（`components.json` `iconLibrary`）
- 按鈕內圖示與文字間距一致（現有 `gap-2`）
- 裝飾圖示 `aria-hidden`；純圖示按鈕必須有 `aria-label`

---

## 5. 模式 Patterns

### 5.1 頁首主操作

```
[eyebrow]
[標題]                         [次要 Outline] [主按鈕 Primary 白字]
[一行說明]
```

### 5.2 可篩選列表

```
[🔍 在輸入框內的搜尋欄] [搜尋按鈕] [狀態篩選] ...
[表頭 sticky]
[表身 scroll · 15 rows · 移動端下拉重新整理]
[顯示 1-15，共 N]     [上一頁] [頁碼] [下一頁]
```

搜尋放大鏡放在輸入框 **內部** 左側；實作必須用 `ListSearchBar`／`SearchField`
（樣式類名 `.list-search` / `.search-field`，舊別名仍可用）。不要放在框外，也不要在頁面內複製 markup。

移動端（`max-width: 900px`）：

- 搜尋輸入框留在工具列；售價／渠道／分類／狀態等篩選收入右側圖示，點擊後從側邊滑出。篩選必須走 `ListSearchBar` 的 `filters`，不要在各頁各自藏選擇器。抽屜內先改選項，按 **確定** 才套用並自動收合；關閉／點遮罩則還原未套用的草稿。
- 表格在頂部下拉觸發 `PullToRefresh` / `ListTable.onRefresh`，不要另做一套刷新 UI

### 5.3 儀表板進度

- 每列獨立 hue（非單一綠系）
- 數值顏色跟隨 `--progress-tone`
- 列可點進對應篩選列表

### 5.4 預覽登入（僅非 Production）

見 [`UI_DEVELOPMENT_STANDARD.md`](UI_DEVELOPMENT_STANDARD.md) §4；不得寫入正式環境。

---

## 6. 實作對照 Implementation map

| 規範概念 | 程式位置 |
|---|---|
| shadcn 設定 | `components.json`（style: `new-york`，cssVariables: true） |
| Design tokens | `src/index.css` `:root` / `.dark` |
| Button CVA | `src/components/ui/button.tsx` |
| Primary 白字覆蓋 | `src/index.css` `a.bg-primary, button.bg-primary` |
| 列表搜尋 | `src/components/ui/search-field.tsx`、`list-search-bar.tsx` |
| 日期範圍 | `src/components/ui/date-range-picker.tsx` |
| 列表分頁／狀態／骨架 | `table-pagination.tsx`、`operational-list-state.tsx`、`table-skeleton.tsx` |
| 進度多色 | `.progress-row.tone-*` + Dashboard progress `tone` |
| 文案 | `src/i18n.ts` |
| 工具函式 | `src/lib/utils.ts`（`cn`） |

**新增元件 checklist**

1. 能否用既有共用組件／token／variant 表達？（先組件化，再寫頁面特例）  
2. 若 ≥2 頁會用到，是否已抽到 `src/components/ui/`？  
3. 是否需要 CVA variant 而不是頁面特例 CSS？  
4. Light／Dark、zh-HK／en、鍵盤與 focus 是否都過？  
5. Primary 實心是否白字？  
6. 若改了約定，是否同步更新本文件與 `UI_DEVELOPMENT_STANDARD.md`？  
7. UI 變更是否補上 `test/*.test.tsx`？

---

## 7. 明確禁止 Anti-patterns

- 引入完整 `antd`／另一套主題引擎與現有 token 雙軌並行
- 品牌主色改回高飽和紅，或 Primary 按鈕用深色字
- 頁面再套居中 `max-width: 1600px` 造成左右過寬
- 訂單進度五條全用品牌綠色系
- Active 導航殘留舊藍／粉紅底而不跟隨 `--primary`
- 業務元件內硬編碼大段顏色／文案
- 多頁複製貼上相同搜尋框／骨架／分頁 markup，而不使用 `src/components/ui/` 共用組件
- 開始／結束日期做成兩個獨立 DatePicker 上下堆疊，而不使用 `DateRangePicker`
- 用動畫或 toast 掩蓋未處理的錯誤狀態
- 表格操作欄把「編輯／修改密碼」等常用按鈕做成 icon+文字並垂直堆疊
- 在 Production 開啟 `VITE_ENABLE_QUICK_LOGIN`
- 為了過測而刪改或弱化既有 UI 測試

---

## 8. 版本與變更

本設計系統隨產品演進。任何已拍板的視覺／互動變更，必須在同一變更集更新：

1. 本文件 `docs/DESIGN_SYSTEM.md`
2. [`UI_DEVELOPMENT_STANDARD.md`](UI_DEVELOPMENT_STANDARD.md)（若屬已列硬規則）
3. 相關測試與實作

審核時以「是否符合本設計系統 + 表格標準 + PRD UX」為準。
