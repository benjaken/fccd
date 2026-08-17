# 生肉出貨預算收成與收成異常

This document records Bubble's 生肉出貨 「預算收成」 formula from the live
Text expression, and how Supabase stores rows that miss that estimate by more
than 15%. The outbound form itself is **not** implemented here.

## Bubble Text expression

On the prepared-meat inbound row (label `入貨(包)`):

```text
Current cell's M_doneMeat's Name
入貨(包)
預算收成:
  Search for M_doneMeat_stocks's each item's in/包 :sum
  / Search for M_doneMeat_stocks's each item's from_rawStock_list's out_quantity(kg) :sum
  * ReceiveData A's column_1_list :sum
  :ceiling
```

`ReceiveData A's column_1_list :sum` is the current 生肉出貨 kg entered on the
form. The Search is for that prepared meat's existing `M_doneMeat_stock` rows.

## Formula

```text
historical_packs   = Σ(該熟貨過往入貨包數 in/包)
historical_raw_kg  = Σ(那些入貨連結生肉出貨 out_quantity(kg))
packs_per_kg       = historical_packs / historical_raw_kg
預算收成           = ceiling(packs_per_kg × 今次生肉出貨 kg)
```

This is the product's **historical packs per kg**, applied to the kg being
dispatched now, then rounded **up**. It is not
`raw_kg × (1 + seasoning + variation) / kg/包`.

## Screenshot check

Form: **生肉出貨**. 豬肉碎(扁食用) **13.91 kg** → 扁食肉餡 (500克) **預算收成 31**.

Live FCCD totals for 扁食肉餡: 575 包 / 260.147 kg = **2.210289 包/kg**.

```text
ceiling(2.210289 × 13.91) = ceiling(30.745) = 31
```

燜牛筋 150.181 kg used to show 87 under the old theoretical formula. The Bubble
rate is 5,436 包 / 14,662 kg = **0.3707 包/kg**:

```text
ceiling(0.3707 × 150.181) = 56
```

Actual 55 包 is within 15% of 56, so it is **not** a 收成異常.

## 15% error rule

Record a `meat_yield_errors` row only when:

```text
abs(actual_packs - expected_packs) / expected_packs > 0.15
```

15% 以內（含剛好 15%）不列為異常。例如預算收成 31 包時，27 與 35 包（±12.9%）不記錄；26 與 36 包（±16.1%）才寫入。

If historical packs or raw kg are missing (no prior inbound with linked
outbound), do not insert an error row.

## Implementation

- SQL: `public.estimate_prepared_meat_yield`, `public.record_meat_yield_error_if_needed`
- Table: `public.meat_yield_errors`
- TS helper: `src/lib/meat-yield.ts`
- Formula version snapshot: `historical_packs_per_kg_ceiling_v1`

## List page

Route `/frozen/yield-errors` (page key `frozen.yield_errors`) is a Frozen Goods
secondary-nav item labelled **收成異常統計**. It is a read-only operational list: `ListSearchBar`,
`ListTable`, and `TablePagination` at **15 rows per page**. The list panel shows
the 預算收成 formula and the 15% listing rule. Search covers raw /
prepared name snapshots and remarks; the extra filter is over / under.

SELECT access matches RLS: Super Admin, Admin, Factory, and Accounting. The
page is read-only. Historical rows are backfilled from prepared inbound
(`inbound_packages`) plus linked raw outbound kg via
`private.backfill_meat_yield_errors`. New rows will also be written when the
outbound form calls `record_meat_yield_error_if_needed`.

Empty and filtered-empty states keep the warning icon with:

- **目前沒有收成異常**
- 調整搜尋或篩選條件後再試。
