-- Let every role granted the stocktake edit action create dated stocktake rows.
-- The legacy policies only allowed hard-coded Admin roles, which blocked Factory
-- users even when role_page_permissions granted the edit action.
drop policy if exists "Administrators insert packing_stocktake_events"
  on public.packing_stocktake_events;
drop policy if exists "Packing stocktake record inserters"
  on public.packing_stocktake_events;
create policy "Packing stocktake record inserters"
on public.packing_stocktake_events
for insert to authenticated
with check (private.has_page_access('kitchen.packing_stocktakes.edit'));

drop policy if exists "Administrators insert ingredient_stocktake_events"
  on public.ingredient_stocktake_events;
drop policy if exists "Ingredient stocktake record inserters"
  on public.ingredient_stocktake_events;
create policy "Ingredient stocktake record inserters"
on public.ingredient_stocktake_events
for insert to authenticated
with check (private.has_page_access('kitchen.ingredient_stocktakes.edit'));
