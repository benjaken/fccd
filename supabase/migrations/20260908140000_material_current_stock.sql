-- Expose the latest stocktake balance for the material rows shown on the
-- ingredient and packaging stocktake pages. Historical stocktake quantities
-- remain unchanged; this RPC only supplies a current-balance comparison.

create or replace function public.get_material_current_stock(
  p_kind text,
  p_ingredient_ids uuid[]
)
returns table (
  ingredient_id uuid,
  quantity numeric,
  stocktake_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if p_kind not in ('ingredient', 'packing') then
    raise exception 'stocktake_kind_invalid' using errcode = '22023';
  end if;

  if not private.has_page_access(
    case when p_kind = 'ingredient'
      then 'kitchen.ingredient_stocktakes'
      else 'kitchen.packing_stocktakes'
    end
  ) then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_ingredient_ids), 0) = 0 then
    return;
  end if;

  if p_kind = 'ingredient' then
    return query
    select distinct on (event.ingredient_id)
      event.ingredient_id, event.quantity, event.stocktake_at
    from public.ingredient_stocktake_events event
    where event.ingredient_id = any(p_ingredient_ids)
    order by event.ingredient_id, event.stocktake_at desc nulls last,
      event.created_at desc, event.id desc;
  else
    return query
    select distinct on (event.ingredient_id)
      event.ingredient_id, event.quantity, event.stocktake_at
    from public.packing_stocktake_events event
    where event.ingredient_id = any(p_ingredient_ids)
    order by event.ingredient_id, event.stocktake_at desc nulls last,
      event.created_at desc, event.id desc;
  end if;
end;
$$;

revoke all on function public.get_material_current_stock(text, uuid[])
  from public, anon;
grant execute on function public.get_material_current_stock(text, uuid[])
  to authenticated;

comment on function public.get_material_current_stock(text, uuid[]) is
  'Returns the latest stocktake quantity and date for requested ingredient or packing items.';
