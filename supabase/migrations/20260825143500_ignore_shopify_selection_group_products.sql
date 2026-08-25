-- Selection-group helpers describe package rules such as "中式小菜 3選1".
-- They are not independently sellable products and must not enter the catalog.

delete from public.shopify_catalog_draft_package_items
where draft_id in (
  select id from public.shopify_catalog_drafts
  where translate(title, '０１２３４５６７８９', '0123456789')
    ~ '[0-9]+[[:space:]]*選[[:space:]]*[0-9]+[）)]?[[:space:]]*$'
);

delete from public.shopify_catalog_draft_choice_sets
where draft_id in (
  select id from public.shopify_catalog_drafts
  where translate(title, '０１２３４５６７８９', '0123456789')
    ~ '[0-9]+[[:space:]]*選[[:space:]]*[0-9]+[）)]?[[:space:]]*$'
);

delete from public.shopify_catalog_draft_variants
where draft_id in (
  select id from public.shopify_catalog_drafts
  where translate(title, '０１２３４５６７８９', '0123456789')
    ~ '[0-9]+[[:space:]]*選[[:space:]]*[0-9]+[）)]?[[:space:]]*$'
);

update public.shopify_catalog_drafts
set approval_status = 'ignored',
    catalog_type = 'unknown',
    blocking_reasons = '{}',
    last_error = null,
    updated_at = now()
where translate(title, '０１２３４５６７８９', '0123456789')
  ~ '[0-9]+[[:space:]]*選[[:space:]]*[0-9]+[）)]?[[:space:]]*$';
