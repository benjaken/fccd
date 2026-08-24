# 維護與驗證

## 重跑機械索引

```text
npm run architecture:index
```

輸出到 `docs/architecture/generated/index.json`。腳本只讀取 `src`、`supabase/migrations`、`supabase/functions`、`scripts`、`test`、`docs`；跳過 `node_modules`、hidden directories、`.env.local` 及完整 payload。輸出內容應只包含檔案路徑、行號、符號／object name、permission key、provider host 摘要與數量。

## 新功能完成後

1. 先重跑 `architecture:index`，確認 route、module、data call、permission、migration、Edge Function 和 test 被索引。
2. 在 [功能目錄](functional-catalog.md) 增加或更新功能卡片；一項功能至少要有 entrypoint、主要資料讀寫、permission、外部副作用、測試及 evidence。
3. 如跨域資料／狀態／副作用改變，更新 [領域模型](domain-model.md) 和 [資料流](data-flows.md)。
4. 如新增／移除 page 或 action key，更新 [權限矩陣](permissions-matrix.md)，並核對 nav、client gate、RLS／RPC／Edge Function。
5. 如 Sitemap／PRD 與程式不一致，更新 [差異與缺口](gaps-and-differences.md)，不要靜默改寫意圖文件。
6. `generatedAt`、`gitHead` 和分析日期只表達底稿來源；不把它們當成部署環境已驗證的證明。

## 文件檢查

最小局部檢查：

```text
npm run architecture:index
openspec validate document-project-functional-architecture --strict
rg -n -i "service_role|supabase_access_token|password\\s*=|-----BEGIN" docs/architecture scripts/generate-architecture-index.mjs
```

另需人工抽樣確認 Mermaid、文件內部連結、引用檔案及 line evidence 仍存在。架構文件本身不改變產品 runtime，因此不應在每次文件局部更新後重跑全量產品回歸；完整回歸按整個開發窗口的節奏執行。

## 可信度與更新規則

- `confirmed`：保留可執行／SQL／test evidence；程式改動時必須重新抽樣。
- `inferred`：說明推導依據；若缺少證據，改為 `openGaps`。
- `intent-only`：保留來源文件和未接通狀態，不在功能目錄中描述為已可用。
- `contradicted`：至少列兩個衝突來源、差異、owner 和後續決策；決策完成後才改成 confirmed。
