-- Any role granted the kitchen.suppliers page must see the full linked
-- item data (catering ingredients, raw meat supply, restaurant ingredients)
-- in the supplier records list. The legacy SELECT policies on the linked
-- tables only cover production/finance/shop roles, so extend them with the
-- page permission like the suppliers table itself.

drop policy if exists "Supplier records readers read ingredients"
  on public.ingredients;

create policy "Supplier records readers read ingredients"
on public.ingredients
for select
to authenticated
using (private.has_page_access('kitchen.suppliers'));

drop policy if exists "Supplier records readers read raw meat supplier links"
  on public.raw_meat_item_suppliers;

create policy "Supplier records readers read raw meat supplier links"
on public.raw_meat_item_suppliers
for select
to authenticated
using (private.has_page_access('kitchen.suppliers'));

drop policy if exists "Supplier records readers read restaurant ingredients"
  on public.restaurant_ingredients;

create policy "Supplier records readers read restaurant ingredients"
on public.restaurant_ingredients
for select
to authenticated
using (private.has_page_access('kitchen.suppliers'));
