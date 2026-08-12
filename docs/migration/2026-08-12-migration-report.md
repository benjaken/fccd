# 2026-08-12 Bubble → Supabase Migration Report

## Snapshot

- Source: Production Bubble Data API
- Target: Supabase main
- Snapshot cutoff: `2026-08-12T02:39:34.000Z`
- Historical cutoff: `2021-08-11T16:00:00.000Z`
- Production source types: 98
- Production source records: 377,116

## Completed phases

| Phase | Scope | Records | UUID issues |
|---|---|---:|---:|
| A | Lookup / Master / Delivery Teams | 464 | 0 |
| B | Products / Packages / Package Products | 12,241 | 0 |
| C | Orders / Order Lines / Payments / Deliveries | 74,754 | 0 |
| D1 | Ingredients / Product Ingredients / Order BOM | 81,972 | 1 issue |
| D2 | Meat / Inventory / Stocktakes | 38,059 | 17 issues |
| E | Restaurant / Shop | 127,759 | 0 |
| S1 | Remaining Lookups / Product and Order Backfills | 7,536 | 0 |
| S2 | Costs / Purchases / Surcharges / Settlements | 16,368 | 0 |
| S3 | Package / Quote / Comments / Tags / File Metadata | 17,963 | 1 issue |
| **Total** | | **377,116** | **19 issues / 24 rows** |

## Progress

```text
Mapped source types: 98 / 98
Table migration rate: 100.0%
Migrated records: 377,116 / 377,116
Record migration rate: 100.0%
Remaining records: 0
```

## Verified UUID references

- Populated, database-constrained UUID references: 950,149 across 139 FK columns
- Unresolved UUID references in migrated master/transaction rows: 0
- Delivery District → Delivery Team: 299 / 299
- Delivery → Motorcade: 3,037 / 3,037
- Issues: 19 accepted dispositions affecting 24 rows; 0 open/future issues
- D2 required UUID relationships unresolved: 0
- Phase E required UUID relationships unresolved: 0
- Meat raw-stock source junctions: 1,263; nullable orphan links: 18
- Known Meat/Inventory orphan IDs: 17, represented by 17 aggregate issues
- S3 missing customer targets: 1 assignment; nullable UUID and one issue

## Reconciliation

- Source/export counts for the fixed 98-type snapshot: complete
- Duplicate Bubble `_id`: 0
- Primitive type drift: 0
- Phase C financial incremental reconciliation: pending
- Option Sets: backend System Settings schema ready; Supabase data 0 / 35;
  frontend static inventory 35 / 35 with 183 values
- Quote-file metadata: 722 / 722. No binary transfer or checksum verification
  has run.
- Fixed snapshot file discovery: exactly 2,711 protocol-relative references
  (1,770 `shop_dailysales.POS sheet`, 722 `quote_file.file`, 203
  `b_deliveryschedule.image`, 8 `ds_channel.Logo_SVG`, and 8
  `ds_channel.Logo_png`).
- Bubble File Manager screenshot total: 4,198. The 1,487 unattached,
  API-unexposed, or otherwise missing items block the baseline.
- Auth/User decision: approved adoption of existing 24 `auth.users` +
  `user_profiles`; no new User table; Bubble `user.pw` is excluded
- Singular `migration` table rows: 0; `migration_*` tables: 0

### D2 reconciliation

- Migration: `20260812065417_create_meat_inventory`
- Source rows: 38,059; target rows: 38,059
- Every source table has matching row, distinct legacy-ID, and distinct UUID
  counts.
- Required D2 UUID foreign keys unresolved: 0
- Junctions: 24 raw-meat suppliers, 1,229 raw-stock allocations, and 1,263
  prepared-to-raw stock sources.
- The 1,263 prepared-to-raw links contain 18 nullable UUID references for 17
  distinct known orphan Bubble IDs. Legacy IDs are retained and 17 aggregate
  `data_quality_issues` account for all 18 affected links.
- Key target totals: raw inbound HKD 5,539,519.99; raw inbound
  146,896.935 kg; raw outbound 146,737.092 kg; seasoning cost 21,819.2841;
  shop price versions 22,583.0209; room price versions 19,642.9378.
- The one-time `bubble-import-phase-d2` endpoint was tombstoned immediately
  after import and returns HTTP 410.

### Phase E reconciliation

- Migration: `20260812070844_create_restaurant_operations`
- Fixed source rows: 127,759 across all 16 source types. The live target has
  12 additional `restaurant_daily_sales` rows created by the prior live
  importer; they were preserved and require incremental reconciliation.
- Every other Phase E source table, including the four zero-row schema types,
  has matching source, target, distinct legacy-ID, and distinct UUID counts.
- Required restaurant, department, supplier, payment-method, service-period,
  delivery-platform, product, cost, cost-type, ingredient, and purchase-type
  UUID relationships unresolved: 0.
- Restaurant ingredient department option values are preserved in 460
  normalized junction rows rather than coerced to fabricated UUIDs.
- Phase E created no data-quality issues and used no placeholder UUIDs.
- `shop_dailysales` was imported in Created Date year partitions; all imports
  were paged and idempotently upserted by `legacy_id`.
- The one-time `bubble-import-phase-e` endpoint was tombstoned immediately
  after verification and returns HTTP 410.

### S1 reconciliation

- Migration: `20260812073258_create_remaining_lookups`
- Source/target rows: 7,536 / 7,536 across 30 source types.
- Zero-row complete: `ds_tags`, `osdriver_menu`, and `print_label`.
- Product/order backfills: 8,302 / 8,302 and 5,922 / 5,922.
- Product links: 1,280 collections, 108 main ingredients, 583 special
  requests, and 0 tags.
- Required S1 UUID relationships unresolved: 0.

### S2 reconciliation

- Migration: `20260812073316_create_finance_and_settlements`
- Source/target rows: 16,368 / 16,368 across five source types.
- Junctions: 4,104 monthly-cost channels and 4,642 settlement payments.
- Required S2 UUID relationships unresolved: 0.

### S3 reconciliation

- Migrations: `20260812073340_create_quote_snapshots_and_metadata` and
  `20260812073848_allow_empty_quote_snapshot_content`
- Source/target rows: 17,963 / 17,963 across ten source types.
- Every source target has matching row, distinct legacy-ID, and UUID counts.
- One customer-tag assignment has no customer target. The source reference is
  retained, `customer_id` is null, and one issue records the missing target.
- File metadata: 722 / 722. No file bytes were copied and no source file
  reference contains a query string or fragment.
- The one-time `bubble-import-remaining` endpoint is an HTTP 410 tombstone.

## Security

- Core tables use RLS.
- Role checks use trusted Auth `app_metadata.role`.
- The new normalized `attachments` migration is committed but not remotely
  applied. It stores a source URL SHA-256 digest rather than the raw URL,
  targets a private bucket, and defaults to service-role-only access.
- One-time import endpoints are HTTP 410 tombstones after completion.
- `Login_code` and Bubble `user.pw` were not imported.
- Supabase leaked-password protection remains plan-dependent.

## File migration blocker and runbook

No file upload was run. The full 4,198-item File Manager CSV/JSON inventory and
a server-only Supabase secret are unavailable. Safe execution additionally
requires review and remote application of
`20260812090637_create_attachments.sql`. The exact inputs, baseline commands,
verification gate, and Modified Date incremental process are documented in
[`BUBBLE_FILE_MIGRATION_RUNBOOK.md`](./BUBBLE_FILE_MIGRATION_RUNBOOK.md).

## Remaining launch order

1. Modified Date incremental catch-up and financial reconciliation
2. Orphan/customer-target business disposition
3. Obtain the complete 4,198-file inventory and execute verified private
   attachment migration
4. Durable worker-handler approval
5. Gated source switch

## Data-source switch

The active source remains Bubble. Switching to Supabase is blocked until:

- incremental reconciliation passes;
- orphan dispositions are approved;
- Auth and files are complete;
- durable worker handlers are separately approved.

