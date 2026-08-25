begin;

do $$
declare
  v_movements integer;
  v_items integer;
begin
  select count(*) into v_movements
  from public.raw_meat_stock_movements
  where legacy_id like 'web-raw-stock-%';

  select count(*) into v_items
  from public.raw_meat_items
  where legacy_id like 'web-raw-meat-%';

  if (v_movements, v_items) is distinct from (2, 1) then
    raise exception
      'web raw-meat test scope changed: movements %, items %',
      v_movements, v_items;
  end if;
end
$$;

delete from public.prepared_meat_stock_raw_sources
where raw_stock_movement_id in (
  select id from public.raw_meat_stock_movements
  where legacy_id like 'web-raw-stock-%'
);

delete from public.raw_meat_stock_relations
where movement_id in (
  select id from public.raw_meat_stock_movements
  where legacy_id like 'web-raw-stock-%'
)
or inbound_movement_id in (
  select id from public.raw_meat_stock_movements
  where legacy_id like 'web-raw-stock-%'
);

delete from public.raw_meat_stock_movements
where legacy_id like 'web-raw-stock-%';

delete from public.raw_meat_item_suppliers
where raw_meat_item_id in (
  select id from public.raw_meat_items
  where legacy_id like 'web-raw-meat-%'
);

delete from public.raw_meat_items as item
where item.legacy_id like 'web-raw-meat-%'
  and not exists (
    select 1 from public.raw_meat_stock_movements movement
    where movement.raw_meat_item_id = item.id
  )
  and not exists (
    select 1 from public.prepared_meat_items prepared
    where prepared.raw_meat_item_id = item.id
  )
  and not exists (
    select 1 from public.meat_order_lines line
    where line.raw_meat_item_id = item.id
  )
  and not exists (
    select 1 from public.meat_seasoning_cost_versions cost
    where cost.raw_meat_item_id = item.id
  )
  and not exists (
    select 1 from public.meat_price_versions price
    where price.raw_meat_item_id = item.id
  )
  and not exists (
    select 1 from public.meat_yield_errors error
    where error.raw_meat_item_id = item.id
  )
  and not exists (
    select 1 from public.supplier_quote_aliases alias
    where alias.raw_meat_item_id = item.id
  )
  and not exists (
    select 1 from public.supplier_quote_lines line
    where line.raw_meat_item_id = item.id
  );

do $$
begin
  if exists (
    select 1 from public.raw_meat_stock_movements
    where legacy_id like 'web-raw-%'
    union all
    select 1 from public.raw_meat_items
    where legacy_id like 'web-raw-%'
  ) then
    raise exception 'web raw-meat test cleanup was incomplete';
  end if;
end
$$;

commit;
