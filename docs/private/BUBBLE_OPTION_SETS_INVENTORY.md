# Bubble Option Sets Inventory

> Local research note. Do not commit or push.
>
> Captured from product-owner input on 2026-08-12.

## Inventory

Total Option Sets reported: **35**

Option Sets with names/options/attribute schemas captured: **35 / 35**

1. `OS Acc_paymentReport`
2. `OS bento_Spicy`
3. `OS Catering_Menu`
4. `OS Catering_mobile_page`
5. `OS catering_stockTake_type`
6. `OS Chef_panel`
7. `OS comment_type`
8. `OS cost input tab`
9. `OS Customer Type`
10. `OS dashboard_version`
11. `OS datepick`
12. `OS Delivery Status`
13. `OS Driver App page`
14. `OS driver confirmation`
15. `OS driver delivery status`
16. `OS Meat_Panel`
17. `OS Meat_report`
18. `OS MeatMenu`
19. `OS meatSetting`
20. `OS Month`
21. `OS payout date`
22. `OS Quote Status`
23. `OS report_date_filter`
24. `OS roster hr`
25. `OS Season`
26. `OS Setting catagory`
27. `OS shop manhr depart`
28. `OS shop_depart_stocktake`
29. `OS shop_full/part_time`
30. `OS shop_menu`
31. `OS shop_new_poduct Tab`
32. `OS shop_report_type`
33. `OS SHOPSetting`
34. `OS Status`
35. `OS User Role`

## Source-name Preservation

The following apparent misspellings/casing are preserved exactly for migration
mapping and must not be silently corrected in source references:

- `OS Setting catagory`
- `OS shop_new_poduct Tab`
- mixed `Catering` / `catering`, `Driver` / `driver`, and `SHOP` / `shop`
  casing

Target-system labels and identifiers may be normalized only after every page,
workflow, field, and stored value is mapped.

## Details Still Required

For each Option Set:

- every option/display value in current order;
- all attributes and attribute types;
- default or fallback behavior where used;
- page, reusable element, workflow, and Data Type references;
- whether any option is deprecated but retained for historical records.

Priority capture order:

1. `OS User Role`
2. `OS Quote Status`
3. `OS Status`
4. `OS Delivery Status`
5. `OS driver confirmation`
6. `OS driver delivery status`
7. menu/page/panel Option Sets
8. accounting, report, stocktake, restaurant, and configuration Option Sets

## Option Details

### OS Acc_paymentReport

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `輸入銀行到帳日`
2. `Masoft發票及收款`

### OS bento_Spicy

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `辣`
2. `不辣`

### OS Catering_Menu

Classification: retained compatibility design. Preserve this Option Set,
option ordering, `page_name` mappings, and behavioral references because it may
be used outside the visible menu. The new UI may present navigation differently,
but must retain equivalent semantics until all page/workflow references are
mapped and proven replaceable.

Custom attributes:

- `page_name` (List of texts)

Built-in attributes:

- `Display` (text)

Options in source order:

1. `主頁`
2. `到會報價單`
3. `到會訂單`
4. `待處理訂單`
5. `出餐日曆`
6. `客戶紀錄`
7. `供應商紀錄`
8. `食材/包裝用品`
9. `單點食物`
10. `套餐`
11. `庫存盤點`
12. `資料輸入進度`
13. `費用輸入`
14. `收款對帳`
15. `材料用量`
16. `報告`
17. `客戶自助`
18. `司機分配`
19. `送貨清單`
20. `用戶管理`
21. `設定`
22. `登出`

Outstanding evidence: per-option `page_name` values were not expanded in the
supplied screenshots.

### OS Catering_mobile_page

Classification: legacy mobile-navigation reference. Preserve for behavior and
permission mapping; do not use it to constrain the new responsive navigation
design.

Custom attributes:

- `page name` (text)

Built-in attributes:

- `Display` (text)

Options in source order:

1. `報價`
2. `新訂單`
3. `所有訂單`
4. `待處理訂單`
5. `客戶自助`
6. `出貨日程`
7. `司機版面`

Outstanding evidence: per-option `page name` values were not expanded in the
supplied screenshot.

### OS catering_stockTake_type

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `食材盤點`
2. `包裝盤點`

### OS Chef_panel

Custom attributes:

- `Page_name` (List of texts)

Built-in attributes:

- `Display` (text)

Options in source order:

1. `廚師版面`

Outstanding evidence: the `Page_name` value was not expanded in the supplied
screenshot.

### OS comment_type

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `customer note`
2. `orderlike`
3. `orderdislike`

### OS cost input tab

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `每週廣告費`
2. `每月營運費用 (非節日)`
3. `每月營運費用(節日)`
4. `月結供應商紀錄`

### OS Customer Type

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `B2C`
2. `B2B`

### OS dashboard_version

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `到會`
2. `凍肉`
3. `餐廳`

### OS datepick

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `單日`
2. `多日`

### OS Delivery Status

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `未派車隊`
2. `待接單`
3. `待取貨`
4. `送貨途中`
5. `已送達`

### OS Driver App page

Classification: retained driver-app navigation reference. Preserve option
semantics and workflow references until the replacement driver navigation is
fully mapped.

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `可接訂單`
2. `已接訂單`
3. `車隊訂單`
4. `合共收入`
5. `分區運費`
6. `設定`
7. `常見問題`

### OS driver confirmation

Name correction: the initial text inventory said `OS driver confrimation`; the
Bubble Editor screenshot confirms the source name is `OS driver confirmation`.

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `接受`
2. `拒絕`

### OS driver delivery status

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `待取貨`
2. `已取`
3. `已送達`

### OS Meat_Panel

Classification: retained panel/page compatibility reference.

Custom attributes:

- `Page_name` (List of texts)

Built-in attributes:

- `Display` (text)

Options in source order:

1. `凍肉版面`

Outstanding evidence: the `Page_name` value was not expanded in the supplied
screenshot.

### OS Meat_report

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `店舖訂貨數量`
2. `產品供店舖平均售價`
3. `產品製作成本及工場用貨售價`
4. `生肉平均來貨價/KG`
5. `製成品存貨`
6. `生肉存貨`
7. `供應商入貨報表`

### OS MeatMenu

Classification: retained meat-module navigation and workflow reference.

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `報表`
2. `生肉存貨計算`
3. `製成品存貨計算`
4. `售價成本計算`
5. `固定香料成本`
6. `香料用量`
7. `設定`
8. `返回主版面`

### OS meatSetting

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `香料成本`
2. `計算設定`
3. `客戶`

### OS Month

Custom attributes:

- `Month` (date)
- `quarter` (text)

Built-in attributes:

- `Display` (text)

Options in source order:

1. `1月`
2. `2月`
3. `3月`
4. `4月`
5. `5月`
6. `6月`
7. `7月`
8. `8月`
9. `9月`
10. `10月`
11. `11月`
12. `12月`

Outstanding evidence: per-option `Month` and `quarter` values were not expanded
in the supplied screenshot.

### OS payout date

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `自訂日期`
2. `付款日期`

### OS Quote Status

Custom attributes:

- `default display` (yes / no)

Built-in attributes:

- `Display` (text)

Options in source order:

1. `Low Chance`
2. `High Chance`
3. `Done Deal`
4. `Case Closed`

Outstanding evidence: each option's `default display` value was not expanded in
the supplied screenshot.

### OS report_date_filter

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `每日`
2. `每星期`
3. `每月`

### OS Season

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `Non-peak`
2. `Festival`

### OS roster hr

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `1`
2. `0.5`

### OS Setting catagory

Source spelling `catagory` is preserved.

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `Sales Partner`
2. `訂單狀態`
3. `檔位類別`
4. `訂單標籤`
5. `送貨方式`
6. `付款方式`
7. `費用選項`
8. `供應商支出`
9. `工場公告`
10. `送貨車隊`
11. `車隊地區運費`
12. `送貨附加費`
13. `報價渠道`
14. `溝通渠道`
15. `節日選項`
16. `報價單 - 運費`
17. `報價單 - T&C`
18. `報價單 - 付款方式`
19. `電郵通知`
20. `入單第一通知人`
21. `入單第二通知人`
22. `指派司機提示`
23. `加單設定`
24. `加單block-date`
25. `客戶標籤`

### OS shop manhr depart

Custom attributes:

- `relate to daily sales depart` (List of texts)
- `sort` (number)

Built-in attributes:

- `Display` (text)

Options in source order:

1. `樓面`
2. `廚房`
3. `水吧`

Outstanding evidence: per-option `relate to daily sales depart` and `sort`
values were not expanded in the supplied screenshot.

### OS shop_depart_stocktake

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `廚房`
2. `水吧`

### OS shop_full/part_time

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `全職`
2. `兼職`

### OS shop_menu

Classification: retained restaurant-module navigation and workflow reference.

Custom attributes:

- `pageName` (List of texts)

Built-in attributes:

- `Display` (text)

Options in source order:

1. `主頁`
2. `每日銷售輸入`
3. `每月費用輸入`
4. `每日採購單輸入`
5. `每月庫存盤點`
6. `銷售報告`
7. `銷售及工時報告`
8. `銷售及薪金報告`
9. `銷售成本報告`
10. `P&L 報告`
11. `新品管理及報告`
12. `餐廳員工名單`
13. `設定`
14. `返回主版面`

Outstanding evidence: per-option `pageName` values were not expanded in the
supplied screenshot.

### OS shop_new_poduct Tab

Source spelling `poduct` is preserved.

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `設定`
2. `報告`

### OS shop_report_type

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `外賣平台`
2. `部門`
3. `時段`

### OS SHOPSetting

Classification: retained restaurant-settings navigation/workflow reference.

Custom attributes: none.

Built-in attributes:

- `Display` (text)

Options in source order:

1. `供應商設定`
2. `供應商費用類別`
3. `每月P&L費用類別`
4. `庫存項目設定`
5. `餐廳設定`
6. `餐廳部門設定`
7. `餐廳銷售時段設定`
8. `餐廳付款方式設定`
9. `餐廳外賣平台設定`
10. `餐廳員工假期`
11. `餐廳更表時間`

### OS Status

Custom attributes:

- `color` (text)

Built-in attributes:

- `Display` (text)

Options in source order:

1. `Active`
2. `Inactive`
3. `Need Update`

Outstanding evidence: each option's `color` value was not expanded in the
supplied screenshot.

### OS User Role

Custom attributes:

- `Office Staff` (yes / no)

Built-in attributes:

- `Display` (text)

Options in source order:

1. `Super Admin`
2. `Admin`
3. `Accounting`
4. `Factory`
5. `Shop manager`
6. `Customer_Main`
7. `Customer_Sub`

Outstanding evidence: each role's `Office Staff` value was not expanded in the
supplied screenshot.
