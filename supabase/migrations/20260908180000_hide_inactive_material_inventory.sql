-- Keep stopped ingredients and packaging out of the active inventory view.
update public.ingredients
set is_active = false, updated_at = now()
where archived_at is null
  and is_active
  and btrim(name) ~ '^[（(]停售[）)]';

create or replace function public.material_inventory_summary(
  p_kind text,
  p_search text default null
)
returns table (
  ingredient_id uuid, sku text, item_name text, ingredient_type text,
  unit text, current_quantity numeric, minimum_stock numeric,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.has_page_access('kitchen.inventory') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_kind not in ('ingredient', 'packing') then
    raise exception 'stocktake_kind_invalid';
  end if;

  return query
  select ingredient.id, ingredient.sku, ingredient.name, ingredient.ingredient_type,
    coalesce(ingredient.stocktake_unit, ingredient.product_unit, ''),
    private.material_inventory_current_balance(p_kind, ingredient.id, now()),
    ingredient.minimum_stock_level,
    greatest(
      case when p_kind = 'ingredient' then (
        select max(e.stocktake_at) from public.ingredient_stocktake_events e
        where e.ingredient_id = ingredient.id
      ) else (
        select max(e.stocktake_at) from public.packing_stocktake_events e
        where e.ingredient_id = ingredient.id
      ) end,
      (select max(m.occurred_at)
        from public.shop_dry_stock_movements m
        join public.shop_catalog_items c on c.id = m.catalog_item_id
        where c.ingredient_id = ingredient.id and c.stocktake_kind = p_kind),
      (select max(cn.consumed_at) from public.order_material_consumptions cn
        where cn.ingredient_id = ingredient.id)
    )
  from public.ingredients ingredient
  where ingredient.archived_at is null
    and ingredient.is_active
    and btrim(ingredient.name) !~ '^[（(]停售[）)]'
    and case when p_kind = 'ingredient'
      then ingredient.is_ingredient_stocktake else ingredient.is_packing_stocktake end
    and (coalesce(btrim(p_search), '') = ''
      or concat_ws(' ', ingredient.sku, ingredient.name, ingredient.ingredient_type)
        ilike '%' || btrim(p_search) || '%')
  order by ingredient.name, ingredient.sku;
end;
$$;
