# FCCD 系统设计文档：功能与架构地图

本目录是 FCCD 的正式系统设计文档，描述实际功能逻辑、领域关系、数据流、权限控制与外部集成。内容以代码、数据库 migration、测试及产品文档交叉验证；它不是新的产品规格，也不取代单一功能 PRD。

## 閱讀入口

- [功能目錄](functional-catalog.md)：按領域整理使用者目的、入口、狀態、資料、權限、副作用及測試證據。
- [領域模型](domain-model.md)：核心詞彙、實體、module／interface／seam 與跨域關係。
- [資料流與整合](data-flows.md)：前端、資料模組、Supabase、Storage、Edge Functions 與第三方流程。
- [權限矩陣](permissions-matrix.md)：頁面權限、action permission、角色與可見／可執行差異。
- [證據索引](evidence-index.md)：功能、資料、權限、整合、測試及意圖文件的可定位證據。
- [差異與缺口](gaps-and-differences.md)：Sitemap／PRD／實作的落差、矛盾、legacy 與待決策事項。
- [代表性走讀](walkthroughs.md)：各主要領域的完整證據鏈抽樣。
- [維護說明](maintenance.md)：如何重跑索引、更新功能卡片及執行文件檢查。
- [機械索引](generated/index.json)：由 `npm run architecture:index` 產生的只讀 JSON 底稿。

## 可信度

- `confirmed`：可由可執行程式、SQL 約束／policy 或測試直接證明。
- `inferred`：由多個證據合理推導，但缺少單一明確契約。
- `intent-only`：只在 PRD、Sitemap、README 或未接通入口中出現。
- `contradicted`：不同來源互相矛盾，需由 owner 決定正確行為。

每條重要結論都應回到證據 ID；推定內容不得寫成已確認的業務規則。
