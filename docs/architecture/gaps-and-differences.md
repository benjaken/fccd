# 差異、矛盾與缺口

這份清單將現況、意圖和未知分開；`inferred` 或 `contradicted` 不應在後續開發中直接當作契約。

## Sitemap 與實際 routes

| 分類 | 目前觀察 | 證據 | 後續處理 |
| --- | --- | --- | --- |
| 實際存在但 Sitemap 未完整反映 | 供應商報價、餐廳設定子頁、工場／司機／migration、部分 order payment／PDF／legacy bookmark | `src/App.tsx:810`、`:935`、`:1914`；`docs/SITEMAP.md:1` | 更新 Sitemap 或標註內部／特殊入口 |
| 同一 pathname 多次宣告 | `/orders/:id`、`/quotes/:id/edit`、`/kitchen` 等 nested／legacy route 在機械索引中重複 | `generated/index.json.routes` | 以功能 ID 去重，不把 route declaration count 當功能數 |
| fallback／特殊入口 | `*`、`control`、`files`、`fk`、`inventory` 等宣告需理解其 runtime 使用 | `src/App.tsx` route index | owner 核對是否保留、隱藏或標記 legacy |
| legacy alias | `/orders/dashboard`、`/quotes/follow-up` 等仍映射到 surviving permission／新入口 | `src/auth/use-page-access.ts:17` | 保留書籤相容，另在導航文件標示 canonical route |

## 產品意圖與實作

| 項目 | 狀態 | 證據／判斷 |
| --- | --- | --- |
| 凍肉供應商 PDF | `confirmed`：目前工作樹已有 parse run、座標抽取、AI adapter 及原子 publish；部署是否已套用需核對 | `src/lib/supplier-quote-api.ts`、`supabase/functions/supplier-quote-ingest/index.ts`、`supabase/functions/_shared/supplier-quote-recognition.ts`、`supabase/migrations/20260822230000_improve_frozen_supplier_pdf_recognition.sql` |
| 客戶自助 | `intent-only`／獨立入口存在但非一般主導航功能 | `docs/SITEMAP.md` 的第二階段、`src/App.tsx` `/customer/*` |
| Bubble migration | `confirmed` server proxy／phase workflow；完整部署狀態需環境核對 | `README.md`、`src/lib/bubble-api.ts`、`supabase/functions/bubble-*` |
| Shopify | `confirmed` 有 sync function／pending order route；provider mapping 和錯誤重試需 runtime 核對 | `src/App.tsx:649`、`supabase/functions/shopify-order-sync/index.ts` |
| 報告來源 | `confirmed` 多數由 RPC read model 聚合，並非直接由前端計算全量 | `src/lib/reports.ts:168`、`:195`、`:271` |
| 權限 enforcement | `confirmed` client page gate + RLS／RPC pattern；每個新 action 需逐項核對 server enforcement | `src/auth/use-page-access.ts:346`、`supabase/migrations/*` |

目前工作樹中 supplier quote recognition 的 function、shared adapter 和 migration 均有未提交變更（見 `git status`）；本架構文件按當前 source 描述，但不推斷 production deployment 已同步。部署前應以 migration／Edge Function smoke check 核對 parse run schema、AI secret、private Storage 和前端 invoke 名稱。

## 高風險邊界

| 邊界 | 目前保護 | 缺口／需要持續驗證 |
| --- | --- | --- |
| 使用者／角色 | `AuthProvider`、`usePageAccess`、`role_page_permissions`、admin Edge Function | role rows、Supabase Auth metadata 與部署環境需抽樣核對 |
| 付款／outstanding | payment active／voided model、order editor、quote payment save | 外部 payment／reference 的 reconciliation 不由前端單獨保證 |
| PDF／Storage | private bucket、signed URL／Edge proxy pattern | 每個新 bucket 和 signed URL TTL 要逐 migration／function 核對 |
| 供應商價格 | supplier quote tables 和 actual inbound movement 分開 | PDF parser／AI 結果需人工確認，不能把 suggestion 當正式資料 |
| migration service role | Bubble functions server-side，browser 只拿 aggregate | 執行環境 secret、cron auth、checkpoint rollback 需 deployment smoke check |
| 庫存／入貨寫入 | raw／prepared movement 用 RPC、unit conversion、relations | 任何報表或匯入功能都不能直接繞過 movement invariant |
| 外部副作用 | Edge Function adapters、status／error 回應 | provider timeout／重試／重入需按整合單獨測試 |

## 待決策清單

- Sitemap 是否要把工場、司機、migration 和新凍肉報價頁納入正式產品樹。
- `control`、`files`、`fk`、`inventory` 等非 slash route 是實驗／內嵌入口還是可移除 legacy。
- 哪些 PRD 中的「後續／第二階段」入口已經由程式接通，及其正式權限與 owner。
- 是否把 architecture index 檢查納入 CI；目前只作手動或開發窗口檢查。
- 對動態 RPC、RLS、trigger、Edge Function deployment 和 provider callback 的 runtime coverage 需要另行建立 smoke test。
