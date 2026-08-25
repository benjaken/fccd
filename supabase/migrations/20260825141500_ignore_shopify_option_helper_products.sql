-- Globo Product Options creates hidden Shopify helper products for option sets.
-- They are not sellable catalog products and must never enter the formal catalog.

alter table public.shopify_catalog_drafts
  drop constraint if exists shopify_catalog_drafts_approval_status_check;

alter table public.shopify_catalog_drafts
  add constraint shopify_catalog_drafts_approval_status_check
  check (approval_status in (
    'pending', 'change_pending', 'dependency_pending', 'conflict',
    'approved', 'rejected', 'ignored', 'deleted'
  ));

delete from public.shopify_catalog_draft_package_items
where draft_id in (
  select id from public.shopify_catalog_drafts
  where tags @> array['globo-product-options']::text[]
     or handle like 'option-set-%'
);

delete from public.shopify_catalog_draft_choice_sets
where draft_id in (
  select id from public.shopify_catalog_drafts
  where tags @> array['globo-product-options']::text[]
     or handle like 'option-set-%'
);

delete from public.shopify_catalog_draft_variants
where draft_id in (
  select id from public.shopify_catalog_drafts
  where tags @> array['globo-product-options']::text[]
     or handle like 'option-set-%'
);

update public.shopify_catalog_drafts
set approval_status = 'ignored',
    catalog_type = 'unknown',
    blocking_reasons = '{}',
    last_error = null,
    updated_at = now()
where tags @> array['globo-product-options']::text[]
   or handle like 'option-set-%';
