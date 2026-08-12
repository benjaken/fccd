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

## Security notes

- The RLS advisor reports `rls_enabled_no_policy` informational notices. This
  is intentional default-deny behavior until tenant and role policies are
  approved.
- Supabase Auth leaked-password protection remains disabled and should be
  enabled in the Dashboard before production launch.
- Unused-index notices are expected before application queries and later data
  phases begin.

## Not yet imported

- meat, inventory, restaurant facts, files and Auth migration
- the 18 known orphan references

No further phase should run until Phase A mappings and the full Schema approval
draft are reviewed.
