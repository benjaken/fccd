# Historical personal reward campaign

Approved campaign `historical-personal-20261016-12m` uses service dates from
2025-10-16 Hong Kong time through the reviewed snapshot on 2026-10-16.
All historical orders belong to personal email accounts. The reviewed manifest
contains 1,267 orders / 1,014 emails / 155,885 points at HK$25 food per point,
rounded down per order. Delivery fees are excluded.

The manifest and production audit are private local artifacts, not committed
customer data. Never populate the campaign by selecting every historical order.
Load only reviewed IDs and amounts, in a transaction that asserts the current
eligibility and the expected count/sum before committing. Track the migration
in `supabase_migrations.schema_migrations` when applying through Management API.

`customer_historical_reward_grants` reserves one grant per order. Pending grants
have no expiry. An auth insert/update of email or email confirmation claims
grants only for a unique, verified, non-deleted, non-banned auth account with the
same normalized email. Existing verified accounts can be processed with the
service-only `private.customer_claim_historical_rewards(uuid)` function.
Claims recheck live order/payment/refund data and produce an `earn:<order_id>`
personal ledger entry with immediate availability and expiry one year after
claim. Account/grant locks and unique order/event keys prevent duplicate awards.
The legacy external-order award function skips reserved campaign orders.

Order changes, payments and recorded food refunds reconcile claimed grants
downward. Reconciliation cannot reissue a revoked award. Available points are
clawed back; amounts already spent become existing personal pending debt.
Unclaimed invalid orders remain reserved but cannot be claimed. No auth
accounts or company reward accounts are created, and no emails are sent by
campaign loading. Email changes cannot transfer already claimed grants.

Validate in a rollback transaction containing the migration, reviewed seed and
`test/historical-personal-rewards.sql`. This exercises unverified/verified
claims, claim idempotency, privileges, expiry, partial refunds, adjustment
idempotency and insufficient-balance debt. No order rows are modified by tests.
After deployment, reconcile grant counts/sums, claimed rows and ledger entries.
