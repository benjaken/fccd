# FCCD — Supabase 操作指引（給 AI 協作者的說明）

> 本文檔總結 FCCD 專案如何連接 Supabase、使用哪個資料庫，以及 migration 的執行情況。
> 目標讀者：任何需要在本專案操作 Supabase 的 AI agent / 開發者。

---

## 1. 連接哪個 Supabase 庫

FCCD 使用同一個 Supabase 專案的兩個 Supabase Branch（不是 Git 分支）：

| 環境 | Supabase branch | Project ref | 用途 |
|---|---|---|---|
| Production | `main` | `vignxasvlxqnyvuhtjlu` | 線上環境 |
| Local development | `develop` | `mxiueauyylnpwlxrvgbo` | 本地開發、migration、Edge Function 測試 |

兩個分支都位於 `ap-northeast-1`。未經明確指示，不得從本地 CLI 對 `main` 執行 migration 或部署 Function。

**前端連線（`src/lib/supabase.ts`）**使用環境變數：

```env
VITE_SUPABASE_URL=https://mxiueauyylnpwlxrvgbo.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # 見 .env.example
```

- 前端只讀 `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`（publishable key，可公開）。
- 不要在程式碼或文件寫入 `service_role` key 或任何密鑰。
- 所有資料庫存取都透過 RLS（Row Level Security）以 JWT role 控制。

### 存取方式

1. **Supabase Dashboard / SQL Editor**：直接查詢與執行 SQL（等同 admin）。
2. **MCP 工具**：本地開發指定 `project_id = "mxiueauyylnpwlxrvgbo"`；只有正式操作才指定 `vignxasvlxqnyvuhtjlu`。
3. **Supabase CLI**：本地先執行 `npx supabase link develop`；正式操作必须显式指定 `--project-ref vignxasvlxqnyvuhtjlu`。

### 其他 Supabase 專案

MCP `list_projects` 可看到多個專案（MPS、breauty100、PMS v3、danny kitchen 等）。FCCD 本地開發使用 `mxiueauyylnpwlxrvgbo`，線上正式環境使用 `vignxasvlxqnyvuhtjlu`，不要與其他專案混淆。

---

## 2. Git 遠端（兩個 GitHub repo）

| remote | URL | 用途 |
|---|---|---|
| `origin` | `https://github.com/chifung-BWSolution/FCCD` | 主要開發 repo |
| `github` | `https://github.com/benjaken/fccd.git` | 備份/鏡像 repo |

注意事項：
- 推送 `github` 時 credential 有時會用錯帳號（`chifung-BWSolution` 無權推 `benjaken/fccd`）→ 403。需要時用 `benjaken` 帳號的 PAT，例如 `git push https://benjaken:<PAT>@github.com/benjaken/fccd.git develop`。
- `origin` 與 `github` 的 `develop` / `main` 需保持同步。

---

## 3. Migration 情況

### 3.1 檔案位置與數量

- 所有 migration 在 `supabase/migrations/*.sql`，共 **108 個檔案**。
- 檔名格式：`YYYYMMDDHHMMSS_名稱.sql`（部分較早檔案是 `YYYYMMDDHHMMSS_...`，後期統一 14 位數字）。

### 3.2 遠端已套用的 migration（截至 2026-08-18）

- 遠端最後套用：**`20260818070617_supplier_linked_item_read_policies`**（記錄於 `supabase_migrations.schema_migrations`）。
- 遠端已套用約 **105 筆** migration，涵蓋：
  - 核心訂單/產品/客戶/供應商 schema（`create_core_catering_schema` 等）
  - 肉類/庫存（`create_meat_inventory`）、餐廳營運（`create_restaurant_operations`）
  - 權限系統（`create_role_page_permissions`、`hierarchical_role_page_permissions`、`permission_driven_settings_access` 等）
  - 報表、凍貨、廚房、供應商、Shopify 同步等後續功能 migration

### 3.3 尚未套用到遠端（本地有、遠端缺）

以下 3 個本地 migration **尚未套用到遠端**（遠端 `app_pages` 沒有 `kitchen.ingredients`、沒有 `packing_stocktake_records` 表）：

| Migration | 內容 |
|---|---|
| `20260818150000_supplier_linked_item_read_policies.sql` | 供應商關聯項目（到會食材/凍肉/餐廳食材）的讀取 RLS policy |
| `20260818160000_kitchen_ingredients_packing_page.sql` | 中央廚房「食材/包裝用品」頁面與 `kitchen.ingredients`/`kitchen.ingredients.edit`/`.delete` 權限 |
| `20260818170000_packing_stocktake_records_page.sql` | 包裝盤點紀錄頁面（`packing_stocktake_records` 等表） |

> ⚠️ 若要這些頁面正常運作，必須先在遠端套用 `20260818160000`（權限）與 `20260818170000`（表）。
> 套用方式：Supabase CLI `supabase db push`、Dashboard SQL Editor，或 MCP `apply_migration`（會直接改遠端，需謹慎）。

### 3.4 已確認存在的遠端資料表（與本專案相關）

- `ingredients`、`packing_materials`、`product_ingredients`（食材/包裝/BOM，D1 遷移建立）
- `packing_stocktake_events`（D2 建立）— 但**沒有** `packing_stocktake_records`
- `suppliers`、`products`、`packages`、`orders`、`order_lines`、`payments`、`deliveries`
- `role_page_permissions`、`app_pages`（權限管理）
- 遠端 `app_pages` 目前有 `kitchen.calendar`、`kitchen.inventory`、`kitchen.suppliers`（含 edit/delete/view_detail），**沒有** `kitchen.ingredients`

---

## 4. 常用操作速查

### 4.1 查資料 / 驗證 schema

```sql
-- 看遠端已套用 migration
select version, name from supabase_migrations.schema_migrations order by version desc;

-- 看某表是否存在
select table_name from information_schema.tables
where table_schema = 'public' and table_name like '%xxx%';
```

### 4.2 檢查權限頁面是否已建立

```sql
select page_key, display_name from public.app_pages order by page_key;
```

### 4.3 套用 migration（謹慎！直接改遠端）

- Supabase CLI：`supabase db push`（會依序套用未套用的 migration）
- Dashboard SQL Editor：手動貼上 migration SQL
- MCP `apply_migration`：一次一個，直接作用遠端

### 4.4 部署 Edge Function

```bash
supabase functions deploy <function-name>
```

Edge function 原始碼在 `supabase/functions/*`，`supabase/config.toml` 有各 function 的 `verify_jwt` 設定。

---

## 5. 重要提醒

1. **不要寫入敏感資料**：service_role key、PAT、密碼一律不得進入程式碼/文件/commit。
2. **migration 不可亂跑**：`apply_migration` 直接改遠端 production，套用前先確認該 migration 是否已在本地 repo、是否已由他人套用。
3. **前端不直接存取機密**：一律走 RLS；角色判斷用 JWT `app_metadata.role`。
4. **origin 與 github 同步**：push 到 `origin` 後若需同步 `github`，注意 `benjaken/fccd` 需要 `benjaken` 帳號權限。
5. **本文件會過時**：migration 持續增加；撰寫時最後狀態為 2026-08-18（遠端至 `20260818070617`，本地另有 3 個未套用）。
