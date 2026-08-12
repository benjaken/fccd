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
| **Total** | | **207,490** | **18 issues / 23 rows** |

## Progress

```text
Mapped source types: 37 / 98
Table migration rate: 37.8%
Migrated records: 207,490 / 377,116
Record migration rate: 55.0%
Remaining records: 169,626
```

## Verified UUID references

- Database-verified migrated references: 179,836
- Unresolved UUID references in migrated master/transaction rows: 0
- Delivery District → Delivery Team: 299 / 299
- Delivery → Motorcade: 3,037 / 3,037
- Current open issue: one missing `S_Order` target affecting five BOM rows
- D2 required UUID relationships unresolved: 0
- Meat raw-stock source junctions: 1,263; nullable orphan links: 18
- Known Meat/Inventory orphan IDs: 17, represented by 17 aggregate issues

## Reconciliation

- Source/export counts for the fixed 98-type snapshot: complete
- Duplicate Bubble `_id`: 0
- Primitive type drift: 0
- Phase C financial incremental reconciliation: pending
- Files and checksum reconciliation: pending
- Auth migration: manually created users are present; Bubble `user.pw` is excluded

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

## Security

- Core tables use RLS.
- Role checks use trusted Auth `app_metadata.role`.
- One-time import endpoints are HTTP 410 tombstones after completion.
- `Login_code` and Bubble `user.pw` were not imported.
- Supabase leaked-password protection remains plan-dependent.

## Remaining migration order

1. E Restaurant / Shop
2. Quote children / Cost / Purchasing
3. Remaining lookup and junction types
4. Modified Date incremental catch-up
5. Final count, FK, finance, file and Auth reconciliation
6. Gated source switch

## Data-source switch

The active source remains Bubble. Switching to Supabase is blocked until:

- all required domains are migrated;
- incremental reconciliation passes;
- orphan dispositions are approved;
- Auth and files are complete;
- durable worker handlers are separately approved.

