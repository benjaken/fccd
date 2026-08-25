begin;

-- Product-detail readers need the source mapping and store domain to render
-- the Shopify admin link beside the formal catalog product name.
drop policy if exists "Product catalog readers read Shopify mappings"
  on public.shopify_catalog_mappings;
create policy "Product catalog readers read Shopify mappings"
  on public.shopify_catalog_mappings
  for select to authenticated
  using (private.has_page_access('products'));

drop policy if exists "Product catalog readers read Shopify stores"
  on public.shopify_stores;
create policy "Product catalog readers read Shopify stores"
  on public.shopify_stores
  for select to authenticated
  using (private.has_page_access('products'));

commit;
