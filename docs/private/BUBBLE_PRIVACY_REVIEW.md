# Bubble Privacy Review

> Local review artifact. Do not commit or push.
>
> Evidence date: 2026-08-12

## Completeness

- Data Types inventoried: **103 / 103**
- Types marked `Privacy rules applied`: **69 / 69 documented**
- Types marked `Publicly visible`: **34 / 34 classified**
- Missing Privacy screenshots: **0**
- Duplicate screenshots were ignored.
- Fourteen heading/name casing differences were normalized to the Bubble Editor
  inventory names.

The Privacy inventory is complete. Page reachability, frontend workflows,
backend workflows, scheduled workflows, and plugin/API writes remain separate
evidence that must still be captured.

## Key Interpretation

`Create/Delete/Modify via API` being disabled does **not** make a type safe.
Bubble Auto-bind is an independent UI write permission, and workflows/plugins
may also write records.

`Everyone else` means the fallback applies without authentication. Where it
grants View, Find in searches, or Auto-bind, that access must be treated as
anonymous.

## Confirmed Business Facts

Confirmed by the product owner on 2026-08-12:

- `User.pw` is actively used for login.
- Attachments use permanent public URLs.

These are active security exposures, not merely legacy/dead fields:

- `User.pw` must be treated as a plaintext credential source. Do not export it,
  include it in screenshots/CSV, migrate it, log it, or preserve it in any new
  business table.
- Existing users require forced password reset/invitation into Supabase Auth.
  Password reuse or transfer is prohibited.
- Permanent attachment URLs provide no revocable record-level authorization.
  Sensitive quote, order, delivery, POS, customer, employee, and financial
  files must move to private storage with short-lived signed access.

## Critical — Immediate Review

### Anonymous Auto-bind

| Data Type | Anonymous Auto-bind fields | Required decision |
|---|---|---|
| Announcement | `annoncement` | Confirm whether any anonymous editor is reachable; restrict publishing to content admins. |
| DS Shipping Method | `Address check`, `Display Name` | Remove anonymous writes; assign an operations-config owner. |
| DS_Status | `color` | Remove anonymous writes; assign a workflow-config owner. |
| S_Order | `Item order`, `Product`, `Quantity`, `remarks1`, `remarks2`, `Unit Price` | Treat as a transaction-integrity incident until production reachability is disproved. |
| S_Payment | `Amount` | Treat as a financial-integrity incident until production reachability is disproved. |

### Credentials and identities

- `User.pw` is a custom plaintext field. The user can Auto-bind their own value;
  Admin/Super Admin can Auto-bind other users' values. It must not be migrated,
  logged, returned, or retained.
- `DS_Super_Motorcade.Login_code` is anonymously readable and editable by any
  authenticated user. If still used for driver login, expire/rotate it and
  replace the flow with secure authentication.
- Anonymous users can search the User type and read `Role`, `User Name`, and
  `email`.
- Admin/Super Admin can Auto-bind `Role` and `shop restro` without evidence of
  approval, audit, or session revocation.

### Public transaction and sensitive data

- Orders/quotes: `A_Order`, `S_Order`, `M_outDone_order`, quote child/reference
  types, and `Quote_file`.
- Finance: `S_Payment`, `S_Payment Report`, `SHOP_dailySales`,
  `SHOP_monthly_cost`, `B_ads Cost Weekly`, `B_cost Monthly`,
  `B_supplierPurchase`, and `SHOP_supplier_purchase`.
- PII: `User`, `M_customer`, `SHOP_DS_staff_list`,
  `DS__ingredient_Supplier`, `DS Sales Partner`, reminder-person types,
  `DS_driver Assign Remind`, and `DS_Super_Motorcade`.
- Delivery: `B_delivery Schedule`, including order links, driver assignments,
  timestamps, charges, statuses, and images.
- Inventory/cost/formulas: `DS_Ingredients`, `M_raw_stock`, `M_rawMeat`,
  `M_seasoning`, stocktake types, `SHOP_Ingredients`, `SHOP_StockTake`, and
  `S_Ingredients_Product`.
- `A_Customers` is explicitly `Publicly visible` and therefore requires a
  deliberate decision; it should not be assumed safe because it lacks custom
  Privacy Rules.

## High — Systemic Authorization Problems

### Any authenticated user can edit business data

Most `bind`, `11`, `1`, and `hello` rules check only whether a user is logged
in. They do not check role, legal entity, restaurant, customer, warehouse,
department, assignment, or document status.

This affects:

- prices, totals, payment amounts, charges, cash counts, and costs;
- order status, quote status, products, quantities, unit price, and remarks;
- inventory counts, unit costs, recipes, and calculation expressions;
- customer, staff, supplier, sales-partner, and driver records;
- restaurant, department, status, payment, delivery, holiday, and period
  configuration.

### Fallback rules neutralize conditional rules

Many types have a conditional authenticated rule followed by `Everyone else`
that still permits Find in searches and View for all fields. The first rule
therefore adds write capability but does not protect reads.

### File access

Many rules grant `View files attached to this` anonymously. `Quote_file`,
delivery images, POS sheets, and other evidence files may expose customer or
financial information. New storage should default to private buckets and
authorize downloads with short-lived signed URLs.

## Medium — Data and Design Quality

- Phone fields stored as numbers will lose leading zeroes, `+852`, and
  formatting; migrate them to text.
- Public product/catalogue needs should be separated from internal fields such
  as cost, ingredient relationships, inactive status, SKU, and operational
  settings.
- Built-in metadata, Slug, Creator, and relationship identifiers are broadly
  exposed even when not needed.
- Rule names such as `1`, `11`, and `hello` carry no authorization meaning and
  make review/error detection harder.
- Formula/configuration values need versioning and audit rather than generic
  Auto-bind.

## Decisions Required from Product Owner

1. Are `User.pw` or driver `Login_code` still used for authentication?
2. Are any of the five anonymous Auto-bind controls reachable in production?
3. Should user email, role, and name be visible without login?
4. Which product fields are truly public catalogue data?
5. How should orders/quotes be scoped: customer, company, site, owner, or a
   combination?
6. Which roles may view/post/reverse payments and modify financial amounts?
7. Which roles may enter, submit, review, lock, and reopen stocktakes?
8. Which managers may view staff/driver/customer/supplier contact information?
9. Who owns each configuration domain: product, delivery, status, restaurant,
   purchasing, and finance?
10. Are quote/POS/delivery files currently public URLs, and what do they contain?
11. Which Data Types are genuinely still used? Confirm with record counts and
    page/workflow references before excluding any.

## Proposed Authorization Baseline

- Default deny for all exposed tables and storage.
- Role plus business scope: legal entity, restaurant/site, warehouse/department,
  customer organization, assigned driver/resource, document status, and
  accounting period.
- Transactional writes through validated server-side functions/workflows.
- No client-editable field used as an authorization source.
- Audit role changes, financial changes, inventory changes, and configuration
  changes.
- Revoke active sessions after privilege removal or account suspension.
