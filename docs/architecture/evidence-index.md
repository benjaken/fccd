# 證據索引

## 引用格式

證據 ID 用前綴區分來源：

- `E-F-*`：功能卡片／使用者流程
- `E-R-*`：路由／入口
- `E-M-*`：前端 module、interface 或純函式
- `E-D-*`：資料表、RPC、policy、bucket、migration
- `E-P-*`：page／action permission
- `E-I-*`：Edge Function／第三方整合
- `E-T-*`：測試／fixture
- `E-DOC-*`：README、Sitemap、PRD、migration report 等意圖或背景文件

每條引用使用 `path:line`、符號名或 SQL object；generated index 只作機械底稿，不能取代人工確認。

## 代表證據

| ID | 內容 | 定位 |
| --- | --- | --- |
| E-DOC-001 | 產品導航意圖 | `docs/SITEMAP.md:1` |
| E-DOC-002 | runtime setup、publishable key 與安全紅線 | `README.md:1` |
| E-R-001 | 主 app route declarations | `src/App.tsx:571` |
| E-R-002 | frozen supplier quotes route | `src/App.tsx:850` |
| E-R-003 | factory／driver／customer／migration entrypoints | `src/App.tsx:1914` |
| E-M-001 | session／profile／login event interface | `src/auth/AuthProvider.tsx:31` |
| E-P-001 | route page key resolution與 legacy alias | `src/auth/use-page-access.ts:17` |
| E-P-002 | Super Admin / access / manage semantics | `src/auth/use-page-access.ts:288` |
| E-M-002 | order creation／edit／payment／delivery orchestration | `src/lib/order-editor.ts:121`、`:322` |
| E-M-003 | quote create／duplicate／confirmation | `src/lib/quote-editor.ts:154`、`:192`、`:404` |
| E-M-004 | delivery filters／assignment／cancel／export | `src/lib/deliveries.ts:429`、`:542` |
| E-M-005 | driver token lifecycle and delivery transitions | `src/lib/driver-delivery.ts:84`、`:155` |
| E-M-006 | factory eligible／group／print status | `src/lib/factory-board.ts:301`、`:594` |
| E-M-007 | raw meat unit conversion and stock-in | `src/lib/raw-meat-inventory.ts:93`、`:320` |
| E-M-008 | prepared meat inbound／outbound | `src/lib/prepared-meat-inventory.ts:74`、`:789` |
| E-M-009 | supplier quote comparison／threshold／CSV | `src/lib/supplier-quotes.ts:538`、`:553`、`:605`、`:864` |
| E-M-010 | report RPC read models | `src/lib/reports.ts:140`、`:188`、`:271` |
| E-M-011 | Bubble scan／relationship adapters | `src/lib/bubble-api.ts:20`、`src/lib/bubble-relations.ts:41` |
| E-D-001 | supplier quote permissions, bucket and tables | `supabase/migrations/20260820210000_frozen_supplier_quote_data_model.sql:9`、`:59`、`:73` |
| E-D-002 | supplier quote RLS | `supabase/migrations/20260820210000_frozen_supplier_quote_data_model.sql:210` |
| E-D-003 | parse run、processing stage、原子 publish migration | `supabase/migrations/20260822230000_improve_frozen_supplier_pdf_recognition.sql:32`、`:176` |
| E-I-001 | supplier quote PDF ingest entrypoint | `supabase/functions/supplier-quote-ingest/index.ts:1` |
| E-I-006 | supplier quote recognition／AI adapter | `supabase/functions/_shared/supplier-quote-recognition.ts:439` |
| E-I-002 | quote confirmation notification | `supabase/functions/send-quote-confirmation/index.ts:1` |
| E-I-003 | driver delivery file proxy | `supabase/functions/driver-delivery-files/index.ts:1` |
| E-I-004 | Bubble scan／relations and migration phases | `supabase/functions/bubble-scan/index.ts:1`、`supabase/functions/bubble-relations/index.ts:1` |
| E-I-005 | Shopify／QZ／login／admin adapters | `supabase/functions/shopify-order-sync/index.ts:1`、`qz-sign/index.ts:1`、`login-log/index.ts:1`、`admin-users/index.ts:1` |
| E-T-001 | test inventory and representative domain tests | `test/`；完整檔案清單見 `generated/index.json` 的 `tests` |

## 機械索引欄位

`generated/index.json` 由 `npm run architecture:index` 產生，包含 `routes`、`modules`、`dataCalls`、`permissions`、`migrationObjects`、`edgeFunctions`、`tests` 和 `docs`。它保留 line evidence 和 git HEAD，但不包含 source content、`.env.local`、Storage file、PDF 或敏感 payload。
