# Bubble entity inventory and research migration

This inventory combines:

- the 103 collection endpoints in the `version-test` Bubble Swagger;
- the data requirements in `API_FUNCTIONAL_PRD.md` section 8;
- a production Data API count probe performed on 2026-08-11.

The classification is intentionally provisional. The PRD still requires
Bubble Editor, Privacy Rules, workflow and business-owner verification before
the raw records are transformed into the final operational schema.

## Inventory result

| Classification | Types | Production records |
|---|---:|---:|
| Core entities | 46 | 351,889 |
| Supporting / reference entities | 57 | 25,139 |
| Total | 103 | 377,028 |

89 types currently contain production records. These five Swagger types return
HTTP 404 from the production Data API and are retained in the catalog so the
migration report records the discrepancy:

- `MM_Products`
- `Announcement`
- `DS_driver assign remind`
- `Font`
- `User`

## Core entities

Core entities carry master or transactional business state:

- Customer and CRM: `A_Customers`, `M_customer`
- Orders and quotes: `A_Order`, `S_Order`, `S_comment`
- Products and packages: `A_Packages`, `A_Products`,
  `S_Packages_Product`, `S_Packages_ChoiceSet`
- Ingredients and production: `DS_Ingredients`,
  `S_Ingredients_Product`, `B_Product_Ingredients`, `DS_Packing`
- Delivery: `B_delivery schedule`, `B_delivery schedule_surcharge`,
  `DS_Super_Motorcade`, `DS_Super_Motorcade_subDriver`
- Payments, costs and purchasing: `S_Payment`, `S_Payment Report`,
  `B_cost monthly`, `B_supplierPurchase`, `B_ads cost weekly`,
  `DS__ingredient_Supplier`
- Meat and inventory: `M_rawMeat`, `M_raw_stock`, `M_doneMeat`,
  `M_doneMeat_stock`, `M_outDone_order`, `M_outDone_doneMeat`,
  `M_seasoning`, `M_MeatSeasoning_cost`, `M_Monthly_MeatPrice`,
  `S_ingredient_stocktake`, `S_Packing_Stocktake`
- Shop operations: `SHOP_dailySales`, `SHOP_DS cost`,
  `SHOP_DS_new_product`, `SHOP DS Restro`, `SHOP_DS_restro_depart`,
  `SHOP_DS_staff_list`, `SHOP_Ingredients`, `SHOP_monthly_cost`,
  `SHOP_roster`, `SHOP_StockTake`, `SHOP_supplier_purchase`
- Identity: `User`

## Supporting entities

The other 57 types provide tags, statuses, channels, templates, option values,
calculation controls, lookup data, snapshots and operational configuration.
They remain part of the migration because core records reference their Bubble
unique IDs and the PRD requires relationship and historical traceability.

The database catalog assigns every type to one of ten domains:

1. customer / CRM
2. orders / quotes
3. products / packages
4. ingredients / production
5. delivery
6. payments / costs / purchasing
7. meat / inventory
8. shop operations
9. calendar / status / users
10. system

## Research staging design

The research migration is lossless and deliberately avoids guessing final
foreign keys or business calculations:

- `migration_entity_catalog` stores the 103-type classification.
- `migration_runs` records each reset/import operation and outcome.
- `migration_progress` stores per-type cursor, count and error state.
- `migration_bubble_records` stores one row per Bubble `_id`, the complete
  source JSON, source timestamps and migration run.

All staging tables have RLS enabled and grant no browser roles direct access.
The Edge Function writes with a server credential and returns progress only.
No raw customer, payment, employee or order payload is returned to the page.
The importer removes `user.pw` before persistence even when that field appears
inside the Bubble source JSON.

The reset action deletes only `migration_bubble_records` and cancels an
unfinished migration run. It never truncates Supabase Auth or unrelated
business tables.

## Migration flow

1. Type `CLEAR RESEARCH DATA AND MIGRATE` on the standalone migration page.
2. The server clears existing research records and creates a run with 103
   progress rows.
3. Four browser workers request one Bubble page at a time (`limit=100`).
4. The server upserts records by `(source_type, legacy_id)`.
5. Cursor and counts are saved after every page, allowing a failed type to be
   identified without losing successful imports.
6. Completion stores imported record and failed-type totals.

This is a staging migration, not the final normalized operational schema.
Normalization must follow the PRD rules: preserve `legacy_id`, convert
relationships to foreign keys, use `numeric` for money, retain transaction
snapshots, archive referenced master data, and verify unresolved workflow and
privacy-rule questions first.

