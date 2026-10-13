# Customer organization portal — initial implementation

> 2026-10-13 起，需求基線改為 `docs/CUSTOMER_PORTAL_PRD_v2.0.md`。積分不可抵餐費；賺分預設每 HK$25 餐費 1 分，後台可發新版本。下文關於密碼登入、每 HK$1 賺 100 分、結帳抵扣的描述只反映當時實作，不再作為方向。

## Personal customer workspace (2026-10-13)

`CustomerPersonalWorkspace` replaces the personal list-only entry with home, brand menus, order history, payment evidence, rewards availability, addresses and profile routes under `/customer/personal`. Existing `/customer/personal/:orderId` links remain valid. Details retain the original receipt and PayPal add-on workflow, use the shared header and return to `/customer/personal/orders`. No password or additional phone matching is offered. Contact phone edits never change trusted order ownership.

Apply `20261013130000_customer_personal_workspace.sql` after the existing customer portal migrations. This creates personal profile/address storage and RPCs, reuses the private payment-evidence bucket and finance review action, and exposes active Shopify store links and guarded repeat-cart data. Personal data is scoped to the verified Auth user; order actions use trusted personal links or the existing, Auth-user-scoped parent-order guard. Previously established capabilities continue to work without asking customers to match their phone again. Profile phone edits are separate from order identity. Organization data/rewards remain separate.

Repeat ordering supports only integer quantities of uniquely mapped, approved, active, simple Shopify variants. Package lines, remarks/custom options, missing or ambiguous mappings and inactive stores/products fail explicitly; nothing is silently omitted. Variant IDs are returned as strings to preserve bigint precision. The customer reviews the prepared cart before visiting Shopify; current Shopify prices and availability remain authoritative. Cart-link creation does not create an order or modify the existing order. Shopify customer SSO and address synchronization are not connected. Addresses saved here currently remain local, and changing them does not change an existing delivery.

Profile notification preferences are stored, not a claim that all existing notification workflows honor them. Personal points issuance, balances and redemption remain unimplemented pending individual reward rules; the page reports unavailable rather than showing zero or an organization balance. Historical Shopify ownership reconciliation and configurable-package option replay remain separate work.

Payment evidence supports JPG/PNG/PDF up to 10MB, a positive two-decimal HKD amount no greater than the order's outstanding balance, a linked order and an existing private uploaded object. Exact submission retries deduplicate by path. Upload does not mark payment complete. Personal evidence appears in the existing finance review queue; organization membership is not required for personal uploads. The organization Storage predicate now returns false for personal-only users so its permissive policy cannot abort a valid personal upload.

Evidence submission atomically queues separate emails to opted-in Super Admin/Admin/Accounting profiles. Deploy `customer-evidence-email`, set `CUSTOMER_EVIDENCE_EMAIL_CRON_SECRET`, `RESEND_API_KEY`, service credentials and `CUSTOMER_EVIDENCE_EMAIL_ENABLED=true`, and schedule POST calls with the cron-secret header to dispatch. The worker honors the existing notification recipient policy and development redirect, claims with locking, retries up to five times and supplies a stable Resend idempotency key. It is disabled by default, and this change does not deploy it, schedule it or send any live email. Verify recipients, retry monitoring and provider idempotency retention before enabling; failures remain in the queue for operator attention.

Validation includes personal-account isolation, default-address transitions, actual Storage RLS evaluation with personal-only identities, evidence authorization/deduplication and repeat-cart bigint/options checks in PGlite, plus route/form/error/empty UI coverage. Local desktop and mobile captures use explicitly labeled synthetic data and production CSS; they do not validate hosted Auth, Shopify or payment providers.

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

- Address editing/archive (`20261012140000`), admin role handover and invitation revoke/list (`20261012150000`), saved-order templates (`20261012160000`), staff org/menu/pricing ops UI (`20261012170000`), employee menu subsets (`20261012180000`), and global reward-rule editors (`20261012190000_customer_portal_reward_rules_ops.sql`, `/settings/customer-portal/reward-rules`) are implemented. Weekly-menu publishing remains separate.
- Membership-authorized add-on checkout, manual add-on payments and points integration; enforce same-brand add-ons in the existing cross-channel RPCs without breaking legacy sessions. Existing PayPal add-ons still use the legacy workflow.
- Cancellation approval, per-add-on cancellation, partial refunds, expiry-preserving point returns and negative-point clawback. The initial customer cancellation RPC only creates an auditable request and does not claim to cancel delivery or refund money.
- Link legacy/Shopify orders to organizations after validated identity reconciliation; configure safe Shopify edit links, conflict review and customer result notifications. The initial portal lists orders created by the portal, not unvalidated historical/company-name matches.
- Confirm fee/delivery-area and original-order cutoff policies, finalize how other discounts/Cashdollar interact with rewards, and reconcile points when an existing order is edited after submission.
- Invoice terms/signatures and numbering must be reconciled with the existing finance editor. Current downloads are read-only transaction snapshots with distinct INV/REC labels; they do not substitute a legally finalized invoice process.
- Real environment integration and authenticated browser QA; no production data, credentials or payments were used for tests.

## Validation

`npm run build` runs affected tests, Edge Function typechecks, frontend typechecks and Vite production bundling. SQL tests execute migrations in PGlite with isolated Auth/Storage stubs, test nonmember access, retry deduplication, stock/cutoff, shared redemption, expiry, reward idempotency, invitation email binding, last-admin protection, evidence review and document access. They do not assert production deployment or provider availability.

## Routed pages and existing entry

### Shared sign-in entry and personal customers

`/customer` exposes Individual / Organization choices using the same 8-digit Supabase email OTP sign-in. Both existing and new users can request a code; server Auth settings govern expiry, resend limits and verification limits. Customer passwords, invitation-only account registration and password reset are removed from the customer flow. Staff authentication remains unchanged. Invitation URLs select the organization flow and still require explicit acceptance against the verified email.

Individual customers select `/customer?mode=personal` and authenticate through OTP. The new `customer_personal_session` RPC derives the owner from `auth.uid()` and requires a verified email, including for users with no orders. Historical orders appear when the verified account email matches the order email, or through trusted `private.customer_personal_order_links` records. Phone is not required. Company inboxes such as `sales@` on Food Channels domains are ignored and do not claim orders. A company name or a legacy lookup token does not grant ownership. The existing personal order detail, receipt and eligible add-on workflows are reused through their parent-order guard. Context switches unmount the previous workspace and discard its UI state. Explicit logout revokes all personal capabilities for that user before ending the shared Auth session.

Personal order URLs use `/customer/personal/:orderId`; refresh, back-to-list and logout remain within the common entry. Existing `/self_service_search` links retain the legacy phone/email lookup and cannot grant membership or reward access. PayPal callbacks support the personal entry through a fixed route allowlist. Apply `20261012110000_customer_otp_identity.sql` after the existing self-service migrations and deploy the updated `customer-addon-paypal` function. Configure hosted Auth email OTP length to 8 and use `{{ .Token }}` in both magic-link and confirmation email templates; local `config.toml` and the supplied HTML template do not change hosted Auth. Verify real delivery, rate limits and expiry in the deployed environment before rollout. No real OTP email or production data was used during local verification.

### Scope of the v1.8 adaptation

Identity visibility now uses `customer_portal_identities()` from `20261012120000_customer_portal_identities.sql`: only verified users receive capabilities, and organization access requires both an active membership and active organization. Anonymous OTP pages contain no mode switch. Personal-only accounts render the personal workspace even when visiting the generic organization URL; switches are shown only when the server confirms both contexts. Failed identity loading shows a retry state without guessing privileges. Explicit invitation acceptance remains available and revalidates identity availability. Personal OTP pages reuse the same branded header and status card as organization pages; legacy order details, receipts and add-on controls remain in place.

This change implements the confirmed OTP change, verified personal identity, shared entry, context isolation and the requested screenshot-based login layout. The latest layout places the supplied logo beside the eyebrow and heading, above the mode selector. The existing organization ordering/rewards and personal order/receipt/add-on details are preserved. This is not completion of all v1.8 acceptance criteria: personal new-order menus, individual points/Level, configurable employee approval, payment-late exception review, multi-file evidence, quotation requests and weekly-menu administration remain separate implementation work. Do not award organization points to personal identities or treat phone/email lookup as member authorization.

The customer workspace link now opens `/customer` rather than the legacy lookup. `CustomerPortalPage` owns the authentication and shared shell; independent page components under `src/components/customer-portal/` mount through nested routes and an outlet context. The old customer workspace placeholder was removed. Navigation uses links, not a local page-state switch.

Routes: `/customer`, `/customer/menus`, `/customer/menus/:menuId`, `/customer/orders`, `/customer/orders/:orderId`, `/customer/receipts`, `/customer/points`, `/customer/team`, `/customer/addresses`, `/customer/profile`. The legacy `/self_service_search` remains available from login. Direct entry, browser history, menu/order detail URLs, unavailable menu IDs and member access to admin-only pages have automated coverage. The existing Vercel catch-all rewrite supports direct route loads.
