# RLS Verification Standard for Completed Pages

Every page or feature that introduces or changes a Supabase data call must
complete RLS verification before it is merged into `develop`.

Pure layout, visual styling, copy, interaction, and client-only component
changes do not require a new RLS verification when they do not add or alter
Supabase table, Storage, RPC, Edge Function, or authentication access.

## Required checks

1. Identify the page's tables, Storage buckets, RPCs, and Edge Functions.
2. Verify permitted roles can read only the intended records.
3. Verify non-permitted roles receive no rows / access denied for protected data.
4. Verify anonymous access is denied unless the page is explicitly public.
5. Verify write paths reject unauthorized role, tenant/site, document-status,
   and ownership combinations.
6. For private files, verify Storage policy and short-lived signed URL behavior.
7. Add automated page-level UI coverage for access-denied and permitted states.
8. Record a SQL RLS simulation using representative role JWT claims in the PR
   validation notes.

## Minimum role matrix

Test Super Admin, Admin, Accounting, Factory, Shop manager, and an unprivileged
role. Include Customer/Driver roles when the page supports them.

## Super Admin settings pages

For `/settings/users`, `/settings/roles`, and `/settings/attachments`:

- Super Admin must read the intended data and manage only approved controls.
- Every non-Super-Admin role must be denied.
- Private attachment access must use a signed URL; never render a permanent
  Storage URL.

## Why UI guards are insufficient

Route visibility only improves UX. The database policy, RPC/Edge Function
authorization, and Storage policy are the final controls.
