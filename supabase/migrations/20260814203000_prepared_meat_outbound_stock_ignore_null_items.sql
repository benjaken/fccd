-- Historical Bubble rows can have null item ids. jsonb_object_agg() rejects a
-- null key, which crashed outbound create/edit while loading on-hand stock.

create or replace function public.prepared_meat_outbound_stock_balances()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.has_page_access('frozen.prepared_meat_inventory') then
    raise exception 'not authorized to read prepared meat stock'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'prepared',
    coalesce(
      (
        select jsonb_object_agg(item_id, stock)
        from (
          select
            prepared_meat_item_id::text as item_id,
            coalesce(sum(inbound_packages), 0) - coalesce(sum(outbound_packages), 0) as stock
          from public.prepared_meat_stock_movements
          where prepared_meat_item_id is not null
          group by prepared_meat_item_id
        ) as prepared_stock
      ),
      '{}'::jsonb
    ),
    'raw',
    coalesce(
      (
        select jsonb_object_agg(item_id, stock)
        from (
          select
            raw_meat_item_id::text as item_id,
            coalesce(sum(inbound_quantity_kg), 0) - coalesce(sum(outbound_quantity_kg), 0) as stock
          from public.raw_meat_stock_movements
          where raw_meat_item_id is not null
          group by raw_meat_item_id
        ) as raw_stock
      ),
      '{}'::jsonb
    )
  );
end;
$$;

revoke all on function public.prepared_meat_outbound_stock_balances() from public;
grant execute on function public.prepared_meat_outbound_stock_balances() to authenticated;

comment on function public.prepared_meat_outbound_stock_balances() is
  'Returns current prepared-meat package and raw-meat kg on-hand balances for outbound checks. Ignores movements with a null item id.';
