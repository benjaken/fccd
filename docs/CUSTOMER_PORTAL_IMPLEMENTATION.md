# Customer organization portal — initial implementation

Baseline: develop `62bb43d3e651d8564a55766d34db53be12474e84`.
Requirement source: FCCD PRD v1.4, including the final payment clarification.

## Implemented

- `/customer`: verified Supabase email/password sign-in, password reset, invitation acceptance, organization membership, assigned menus, ordering, repeat ordering, shared points, addresses, team invitations/deactivation and cancellation requests.
- `/customer-payment-review`: finance-only queue, private evidence access, approval/rejection; approval writes a payment exactly once. Organization admins do not receive finance privileges.
- Upload evidence -> finance review -> download read-only receipts and invoices. Downloads use the existing document renderer; the RPC checks organization membership and payment eligibility. Zero-due orders are eligible without evidence. Browser print supports saving the document as PDF.
- New orders reuse `orders`, `order_lines`, `payments` and `channels`. Assigned-menu prices, delivery date, fee and stock are authoritative in SQL. The customer cannot submit a unit price or organization ID.
- Idempotent request IDs, shared account locking, earliest-expiry redemption allocation, integer earned points, 10-point redemption units, one-year expiry and completion rewards. Customer-facing prices do not display a tariff category.
- Existing contact-based lookup and PayPal add-on components remain in place.

## Deployment (not executed)

Apply the four `20261012` migrations in timestamp order to a reviewed development database first. They create new tables, a private Storage bucket, tightly scoped RPC grants, an additional order source and a completion trigger. No historical rewards are backfilled.

Provision the first verified admin using trusted database access; do not infer membership from contact information or company names. Set Supabase Auth redirect allowlists for `/customer` and `/reset-password` and configure the email provider. Only public Supabase keys belong in the browser.

Create an organization and membership, then a menu assignment and item rows referencing real `channels`/`products`; record both price and available quantity. An assignment belongs to one organization and one brand. Prices are resolved before publishing an assignment; users do not choose a tariff. Menu cutoff and delivery/fee policy require real operational values, not the sample data used by tests.

Finance reviewers must have an existing `user_profiles.role` of Super Admin, Admin or Accounting. Reviewers sign in through the existing staff login. Evidence links expire after 60 seconds and the bucket is private. Review timestamps currently represent verification time; payer transaction date is not yet collected.

## Still required before full PRD acceptance

This is the first implementation slice, not a claim that the entire PRD is complete:

- Organization/menu/pricing operational configuration screens, member role transfer, invitation revocation, saved-order templates and address editing/deletion.
- Membership-authorized add-on checkout, manual add-on payments and points integration; enforce same-brand add-ons in the existing cross-channel RPCs without breaking legacy sessions. Existing PayPal add-ons still use the legacy workflow.
- Cancellation approval, per-add-on cancellation, partial refunds, expiry-preserving point returns and negative-point clawback. The initial customer cancellation RPC only creates an auditable request and does not claim to cancel delivery or refund money.
- Link legacy/Shopify orders to organizations after validated identity reconciliation; configure safe Shopify edit links, conflict review and customer result notifications. The initial portal lists orders created by the portal, not unvalidated historical/company-name matches.
- Confirm fee/delivery-area and original-order cutoff policies, finalize how other discounts/Cashdollar interact with rewards, and reconcile points when an existing order is edited after submission.
- Invoice terms/signatures and numbering must be reconciled with the existing finance editor. Current downloads are read-only transaction snapshots with distinct INV/REC labels; they do not substitute a legally finalized invoice process.
- Real environment integration and authenticated browser QA; no production data, credentials or payments were used for tests.

## Validation

`npm run build` runs affected tests, Edge Function typechecks, frontend typechecks and Vite production bundling. SQL tests execute migrations in PGlite with isolated Auth/Storage stubs, test nonmember access, retry deduplication, stock/cutoff, shared redemption, expiry, reward idempotency, invitation email binding, last-admin protection, evidence review and document access. They do not assert production deployment or provider availability.

## Routed pages and existing entry

The customer workspace link now opens `/customer` rather than the legacy lookup. `CustomerPortalPage` owns the authentication and shared shell; independent page components under `src/components/customer-portal/` mount through nested routes and an outlet context. The old customer workspace placeholder was removed. Navigation uses links, not a local page-state switch.

Routes: `/customer`, `/customer/menus`, `/customer/menus/:menuId`, `/customer/orders`, `/customer/orders/:orderId`, `/customer/receipts`, `/customer/points`, `/customer/team`, `/customer/addresses`, `/customer/profile`. The legacy `/self_service_search` remains available from login. Direct entry, browser history, menu/order detail URLs, unavailable menu IDs and member access to admin-only pages have automated coverage. The existing Vercel catch-all rewrite supports direct route loads.
