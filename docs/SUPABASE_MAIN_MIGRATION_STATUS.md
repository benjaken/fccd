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

## Security notes

- The RLS advisor reports `rls_enabled_no_policy` informational notices. This
  is intentional default-deny behavior until tenant and role policies are
  approved.
- Supabase Auth leaked-password protection remains disabled and should be
  enabled in the Dashboard before production launch.
- Unused-index notices are expected before application queries and later data
  phases begin.

## Not yet imported

- `products`, `packages`, `package_products`
- `orders`, `order_lines`, `payments`, `deliveries`
- meat, inventory, restaurant facts, files and Auth migration
- the 18 known orphan references

No further phase should run until Phase A mappings and the full Schema approval
draft are reviewed.
