# Supabase Main Migration Status

## Applied schema

- Target: Supabase `main` (`vignxasvlxqnyvuhtjlu`)
- Migration: `create_core_catering_schema`
- Source snapshot: `2026-08-12T02:39:34.000Z`
- Existing `auth.users` and `public.user_profiles` were preserved.
- No table was truncated or dropped.

Created normalized tables:

- Phase A: `channels`, `payment_methods`, `delivery_districts`,
  `shipping_methods`, `order_statuses`, `order_tags`, `suppliers`,
  `restaurants`, `restaurant_departments`
- Commercial master: `customers`, `products`, `packages`, `package_products`
- Transactions: `orders`, `order_lines`, `payments`, `deliveries`
- D2 Meat / Inventory: normalized meat master, order, movement, cost,
  stock-source junction, and stocktake tables
- Phase E Restaurant / Shop: normalized payment, period, platform, product,
  cost, purchase, ingredient, sales, stocktake, supplier-purchase, and roster
  tables

All new tables:

- use UUID primary keys;
- retain unique Bubble `legacy_id`;
- have RLS enabled;
- grant no access to `anon` or `authenticated`;
- include indexes for declared UUID foreign keys.

## Phase A import

| Target table | Imported | Unique legacy IDs | Unique UUIDs |
|---|---:|---:|---:|
| `channels` | 8 | 8 | 8 |
| `payment_methods` | 17 | 17 | 17 |
| `delivery_districts` | 314 | 314 | 314 |
| `shipping_methods` | 6 | 6 | 6 |
| `order_statuses` | 12 | 12 | 12 |
| `order_tags` | 30 | 30 | 30 |
| `suppliers` | 66 | 66 | 66 |
| `restaurants` | 2 | 2 | 2 |
| `restaurant_departments` | 4 | 4 | 4 |
| **Total** | **459** | **459** | **459** |

Two existing `user_profiles.shop_restro_legacy_id` values contained restaurant
display names rather than Bubble IDs. Both were resolved by exact
`restaurants.name` matching and written to `shop_restro_id` UUID foreign keys.

The one-time `bubble-import-phase-a` endpoint was disabled immediately after
the successful run and now returns HTTP 410.

## Role policies

- Authenticated users can read non-sensitive lookup and catalog tables.
- Super Admin and Admin can write core tables.
- Accounting can read suppliers, customers, orders, order lines, payments and
  deliveries.
- Factory can read orders, order lines and deliveries.
- Supplier/customer reads remain unavailable to Factory and Shop manager.
- Role checks use trusted Auth `app_metadata.role`, not user-editable metadata.

## Phase B import

| Target table | Imported | Unique legacy IDs | Unique UUIDs | Unresolved UUID FKs |
|---|---:|---:|---:|---:|
| `products` | 8,302 | 8,302 | 8,302 | 0 |
| `packages` | 175 | 175 | 175 | 0 |
| `package_products` | 3,764 | 3,764 | 3,764 | 0 |
| `customers` | 0 | 0 | 0 | 0 |
| **Total** | **12,241** | **12,241** | **12,241** | **0** |

The first Phase B attempt stopped before writing package-product rows because
the UUID-map query used Supabase's default 1,000-row response limit. Products
and packages were already idempotently upserted. The query was changed to
1,000-row pagination, the import resumed successfully, and the one-time
endpoint was then disabled with HTTP 410.

## Phase C import

| Target table | Imported | Unresolved UUID FKs |
|---|---:|---:|
| `orders` | 5,922 | 0 |
| `order_lines` | 61,073 | 0 |
| `payments` | 4,711 | 0 |
| `deliveries` | 3,048 | 0 |
| **Total** | **74,754** | **0** |

`s_order` was imported in four Created Date partitions to avoid Bubble's
50,000-cursor boundary. The one-time importer was disabled with HTTP 410 after
completion.

The imported financial sums differ from the earlier report snapshot:

- `orders.grand_total`: HKD 26,384,837.10
- report snapshot: HKD 26,383,281.10
- difference: HKD 1,556.00
- `orders.shipping_fee` difference: HKD 50.00

Counts and UUID relationships reconcile, but production records were modified
after the report export. A Modified Date incremental pass is required before
financial sign-off.

## Phase D1 Ingredients/BOM import

| Target table | Imported | Unresolved master UUID FKs |
|---|---:|---:|
| `ingredients` | 317 | 0 |
| `product_ingredients` | 1,747 | 0 |
| `order_bom_requirements` | 79,908 | 0 |
| `packing_materials` | 0 | 0 |
| **Total** | **81,972** | **0** |

The BOM source was imported in four Created Date year partitions (2023–2026)
to remain below Bubble's 50,000-cursor boundary. One orphan `S_order` target
affects 5 BOM rows; those rows retain nullable `order_line_id` values, use no
placeholder UUID, and are represented by 1 open data-quality issue. The
one-time importer was disabled immediately after completion and now returns
HTTP 410.

## Delivery team UUID resolution

- Imported 5 `DS_Super_Motorcade` records into `delivery_teams`.
- Resolved 299 / 299 `delivery_districts.driver_team_legacy_id` values to
  `driver_team_id` UUID foreign keys.
- Resolved 3,037 / 3,037 `deliveries.motorcade_legacy_id` values to
  `motorcade_id` UUID foreign keys.
- Added database FK constraints and covering indexes for both relationships.
- Bubble `Login_code` was intentionally not imported; `delivery_teams` has no
  login-code column.
- The one-time importer was disabled with HTTP 410.

## Phase D2 Meat / Inventory import

Applied migration: `20260812065417_create_meat_inventory`.

| Source type | Target table | Imported | Unresolved required UUID FKs |
|---|---|---:|---:|
| `m_cal_to_kg` | `meat_unit_conversions` | 4 | 0 |
| `m_calculation%` | `meat_calculation_settings` | 1 | 0 |
| `m_customer` | `meat_customers` | 4 | 0 |
| `m_rawmeat` | `raw_meat_items` | 15 | 0 |
| `m_donemeat` | `prepared_meat_items` | 29 | 0 |
| `m_seasoning` | `seasonings` | 83 | 0 |
| `m_shippingmethod` | `meat_shipping_methods` | 1 | 0 |
| `m_outdone_order` | `meat_orders` | 1,169 | 0 |
| `m_outdone_donemeat` | `meat_order_lines` | 9,823 | 0 |
| `m_raw_stock` | `raw_meat_stock_movements` | 2,430 | 0 |
| `m_donemeat_stock` | `prepared_meat_stock_movements` | 11,263 | 0 |
| `m_meatseasoning_cost` | `meat_seasoning_cost_versions` | 645 | 0 |
| `m_monthly_meatprice` | `meat_price_versions` | 646 | 0 |
| `s_ingredient_stocktake` | `ingredient_stocktake_events` | 8,745 | 0 |
| `s_packing_stocktake` | `packing_stocktake_events` | 3,201 | 0 |
| **Total** | | **38,059** | **0** |

Each target count equals both its distinct `legacy_id` and distinct UUID count.
The import also created 24 raw-meat supplier links and 1,229 raw-stock
allocation links.

`m_donemeat_stock.from_rawStock_list` produced 1,263 junction rows. Eighteen
references point to 17 distinct known orphan IDs. Those rows retain the Bubble
ID and a nullable UUID FK; no UUID was fabricated. Seventeen aggregate
data-quality issues account for all 18 affected links.

Verified amount and quantity totals are:

- raw inbound amount: HKD 5,539,519.99
- raw inbound quantity: 146,896.935 kg
- raw outbound quantity: 146,737.092 kg
- seasoning version total cost: 21,819.2841
- meat price version shop / room totals: 22,583.0209 / 19,642.9378

The one-time D2 importer was disabled immediately after completion and now
returns HTTP 410. No credential, password, login-code, or `Created By` value
was imported.

## Phase E Restaurant / Shop import

Applied migration: `20260812070844_create_restaurant_operations`.

| Source type | Target table | Imported | Unresolved required UUID FKs |
|---|---|---:|---:|
| `shop_ds_new_product` | `restaurant_new_products` | 106 | 0 |
| `shop_dscost_type` | `restaurant_cost_types` | 9 | 0 |
| `shop_dscost` | `restaurant_costs` | 26 | 0 |
| `shop_dspaymentmethod` | `restaurant_payment_methods` | 13 | 0 |
| `shop_dsrestro_period` | `restaurant_service_periods` | 5 | 0 |
| `shop_food_deli_platform` | `restaurant_delivery_platforms` | 5 | 0 |
| `shopds_purchasetype` | `restaurant_purchase_types` | 3 | 0 |
| `shop_ingredients` | `restaurant_ingredients` | 457 | 0 |
| `shop_dailysales` | `restaurant_daily_sales` | 77,947 | 0 |
| `shop_monthly_cost` | `restaurant_monthly_costs` | 1,508 | 0 |
| `shop_stocktake` | `restaurant_stocktake_events` | 23,053 | 0 |
| `shop_supplier_purchase` | `restaurant_supplier_purchases` | 24,627 | 0 |
| `shop_ds_holiday` | `restaurant_holidays` | 0 | 0 |
| `shop_ds_staff_list` | `restaurant_staff` | 0 | 0 |
| `shop_ds_time_slot` | `restaurant_time_slots` | 0 | 0 |
| `shop_roster` | `restaurant_rosters` | 0 | 0 |
| **Total** | | **127,759** | **0** |

Every fixed Phase E source ID is represented. The live target currently has 12
additional `restaurant_daily_sales` rows from the prior live importer
(77,959 target versus 77,947 fixed-snapshot rows); they were preserved for
incremental reconciliation. All existing restaurant, department, and supplier
references and all new dimension references resolved to UUIDs. The 460
ingredient-department option values are safely retained in
`restaurant_ingredient_departments`; no option value was converted into a
fabricated UUID. Phase E produced no `data_quality_issues`.

The large fact types were imported with paging and Created Date year
partitions, using idempotent `legacy_id` upserts. The one-time Phase E importer
was disabled immediately after verification and now returns HTTP 410.

## Phase S1 Remaining lookups and backfills

Applied migration: `20260812073258_create_remaining_lookups`.

- Imported 7,536 rows across 30 source types, including 7,252 product labels.
- Created explicit zero-row schemas for `ds_tags`, `osdriver_menu`, and
  `print_label`; each is complete at 0 / 0.
- Backfilled all 8,302 products and 5,922 orders from the same fixed snapshot.
- Created 1,280 product-collection, 108 main-ingredient, 583 special-request,
  and 0 product-tag links.
- Every source target count equals its distinct `legacy_id` and UUID count.
- All populated S1 legacy references resolved to UUIDs.

## Phase S2 Finance and settlements

Applied migration: `20260812073316_create_finance_and_settlements`.

| Source type | Target table | Imported | Unresolved UUID FKs |
|---|---|---:|---:|
| `b_adscostweekly` | `advertising_costs` | 1,265 | 0 |
| `b_costmonthly` | `monthly_costs` | 1,408 | 0 |
| `b_supplierpurchase` | `supplier_purchases` | 9,988 | 0 |
| `b_deliveryschedule_surcharge` | `delivery_surcharges` | 1,560 | 0 |
| `s_paymentreport` | `payment_settlements` | 2,147 | 0 |
| **Total** | | **16,368** | **0** |

The normalized children contain 4,104 monthly-cost channel links and 4,642
settlement-payment links. All counts, distinct legacy IDs, and UUIDs match.

## Phase S3 Package and quote snapshots

Applied migrations:

- `20260812073340_create_quote_snapshots_and_metadata`
- `20260812073848_allow_empty_quote_snapshot_content`

Imported 17,963 rows across 10 source types. This includes package choice sets
and calculations, bento quote children, payment and terms snapshots, comments,
customer-tag assignments, and 722 file-metadata rows. File bytes were not
copied, and query strings/fragments were removed from source file references.

The private binary migration remains blocked. The fixed snapshot exposes
exactly 2,711 valid file references, while the Bubble File Manager screenshot
reports 4,198 total files. The missing 1,487-item inventory and a server-only
Supabase secret are unavailable. A normalized, service-role-only `attachments`
schema and private bucket migration are committed but have not been remotely
applied; no attachment rows or objects were created. See
`docs/migration/BUBBLE_FILE_MIGRATION_RUNBOOK.md`.

All S3 target, distinct legacy-ID, and UUID counts match their sources. One
customer-tag assignment has no matching customer row; its `customer_id`
remains null and one open `data_quality_issues` row records the missing target.
No placeholder UUID was created.

The fixed snapshot is now complete: 98 / 98 source types and 377,116 / 377,116
records, with 0 remaining. The one-time `bubble-import-remaining` endpoint was
tombstoned immediately after verification and returns HTTP 410.

## Security notes

- The RLS advisor reports `rls_enabled_no_policy` informational notices. This
  is intentional default-deny behavior until tenant and role policies are
  approved.
- Supabase Auth leaked-password protection remains disabled and should be
  enabled in the Dashboard before production launch.
- Unused-index notices are expected before application queries and later data
  phases begin.

## Remaining launch gates

- Modified Date incremental and financial reconciliation
- disposition of 19 open issues affecting 24 rows
- complete 4,198-item File Manager export, server secret, and verified private
  file-byte migration
- durable worker-handler approval and gated source switch

The singular `migration` table remains empty. No `migration_*` tables exist.
