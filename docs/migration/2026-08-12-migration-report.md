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
| **Total** | | **169,431** | **1 issue / 5 rows** |

## Progress

```text
Mapped source types: 22 / 98
Table migration rate: 22.4%
Migrated records: 169,431 / 377,116
Record migration rate: 44.9%
Remaining records: 207,685
```

## Verified UUID references

- Database-verified migrated references: 179,836
- Unresolved UUID references in migrated master/transaction rows: 0
- Delivery District → Delivery Team: 299 / 299
- Delivery → Motorcade: 3,037 / 3,037
- Current open issue: one missing `S_Order` target affecting five BOM rows
- Known future Meat/Inventory orphan references: 17

## Reconciliation

- Source/export counts for the fixed 98-type snapshot: complete
- Duplicate Bubble `_id`: 0
- Primitive type drift: 0
- Phase C financial incremental reconciliation: pending
- Files and checksum reconciliation: pending
- Auth migration: manually created users are present; Bubble `user.pw` is excluded

## Security

- Core tables use RLS.
- Role checks use trusted Auth `app_metadata.role`.
- One-time import endpoints are HTTP 410 tombstones after completion.
- `Login_code` and Bubble `user.pw` were not imported.
- Supabase leaked-password protection remains plan-dependent.

## Remaining migration order

1. D2 Meat / Inventory
2. E Restaurant / Shop
3. Quote children / Cost / Purchasing
4. Remaining lookup and junction types
5. Modified Date incremental catch-up
6. Final count, FK, finance, file and Auth reconciliation
7. Gated source switch

## Data-source switch

The active source remains Bubble. Switching to Supabase is blocked until:

- all required domains are migrated;
- incremental reconciliation passes;
- orphan dispositions are approved;
- Auth and files are complete;
- durable worker handlers are separately approved.

