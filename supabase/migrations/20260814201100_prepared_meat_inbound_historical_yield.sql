create or replace function public.prepared_meat_inbound_raw_preview(
  p_raw_meat_item_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_remaining numeric(14, 3);
begin
  if not private.has_page_access('frozen.prepared_meat_inventory') then
    raise exception 'not authorized to record prepared meat inbound'
      using errcode = '42501';
  end if;

  if p_raw_meat_item_id is null then
    raise exception 'raw meat item is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.raw_meat_items
    where id = p_raw_meat_item_id
      and archived_at is null
  ) then
    raise exception 'raw meat item not found'
      using errcode = 'P0002';
  end if;

  select coalesce(sum(inbound_quantity_kg), 0) - coalesce(sum(outbound_quantity_kg), 0)
  into v_remaining
  from public.raw_meat_stock_movements
  where raw_meat_item_id = p_raw_meat_item_id;

  return jsonb_build_object(
    'remaining_kg', coalesce(v_remaining, 0),
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'sku', item.sku,
            'name', item.name,
            'unit', item.unit,
            'kg_per_package', item.kg_per_package,
            'historical_inbound_packs', packs.inbound_packs,
            'historical_raw_outbound_kg', raw_hist.raw_out_kg
          )
          order by item.sort_order nulls last, item.name
        )
        from public.prepared_meat_items as item
        left join lateral (
          select coalesce(sum(prep.inbound_packages), 0) as inbound_packs
          from public.prepared_meat_stock_movements as prep
          where prep.prepared_meat_item_id = item.id
            and coalesce(prep.inbound_packages, 0) > 0
        ) as packs on true
        left join lateral (
          select coalesce(sum(raw.outbound_quantity_kg), 0) as raw_out_kg
          from public.prepared_meat_stock_movements as prep
          join public.prepared_meat_stock_raw_sources as src
            on src.prepared_movement_id = prep.id
          join public.raw_meat_stock_movements as raw
            on raw.id = src.raw_stock_movement_id
          where prep.prepared_meat_item_id = item.id
            and coalesce(prep.inbound_packages, 0) > 0
        ) as raw_hist on true
        where item.raw_meat_item_id = p_raw_meat_item_id
          and item.archived_at is null
          and item.is_active
          and coalesce(item.kg_per_package, 0) > 0
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.prepared_meat_inbound_raw_preview(uuid) from public;
grant execute on function public.prepared_meat_inbound_raw_preview(uuid) to authenticated;

comment on function public.prepared_meat_inbound_raw_preview(uuid) is
  'Returns remaining raw kg, matching prepared items, and historical yield totals for 製成品入貨(扣原料).';
