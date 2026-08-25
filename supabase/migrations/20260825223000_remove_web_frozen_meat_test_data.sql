begin;

do $$
declare
  v_orders integer;
  v_lines integer;
  v_prepared_movements integer;
  v_raw_movements integer;
  v_items integer;
begin
  select count(*) into v_orders
  from public.meat_orders where legacy_id like 'web-prep-order-%';
  select count(*) into v_lines
  from public.meat_order_lines where legacy_id like 'web-prep-line-%';
  select count(*) into v_prepared_movements
  from public.prepared_meat_stock_movements where legacy_id like 'web-prep-%';
  select count(*) into v_raw_movements
  from public.raw_meat_stock_movements where legacy_id like 'web-prep-%';
  select count(*) into v_items
  from public.prepared_meat_items where legacy_id like 'web-prep-item-%';

  if (v_orders, v_lines, v_prepared_movements, v_raw_movements, v_items)
    is distinct from (3, 5, 8, 5, 1)
  then
    raise exception
      'web frozen-meat test scope changed: orders %, lines %, prepared movements %, raw movements %, items %',
      v_orders, v_lines, v_prepared_movements, v_raw_movements, v_items;
  end if;
end
$$;

delete from public.meat_yield_errors
where prepared_stock_movement_id in (
  select id from public.prepared_meat_stock_movements
  where legacy_id like 'web-prep-%'
);

delete from public.prepared_meat_stock_raw_sources
where prepared_movement_id in (
  select id from public.prepared_meat_stock_movements
  where legacy_id like 'web-prep-%'
)
or raw_stock_movement_id in (
  select id from public.raw_meat_stock_movements
  where legacy_id like 'web-prep-%'
);

delete from public.raw_meat_stock_relations
where movement_id in (
  select id from public.raw_meat_stock_movements
  where legacy_id like 'web-prep-%'
)
or inbound_movement_id in (
  select id from public.raw_meat_stock_movements
  where legacy_id like 'web-prep-%'
);

delete from public.prepared_meat_stock_movements
where legacy_id like 'web-prep-%';

delete from public.raw_meat_stock_movements
where legacy_id like 'web-prep-%';

delete from public.meat_order_lines
where legacy_id like 'web-prep-line-%';

delete from public.meat_orders
where legacy_id like 'web-prep-order-%';

delete from public.prepared_meat_items as item
where item.legacy_id like 'web-prep-item-%'
  and not exists (
    select 1 from public.meat_order_lines line
    where line.prepared_meat_item_id = item.id
  )
  and not exists (
    select 1 from public.prepared_meat_stock_movements movement
    where movement.prepared_meat_item_id = item.id
  )
  and not exists (
    select 1 from public.meat_seasoning_cost_versions cost
    where cost.prepared_meat_item_id = item.id
  );

do $$
begin
  if exists (
    select 1 from public.meat_orders where legacy_id like 'web-prep-%'
    union all
    select 1 from public.meat_order_lines where legacy_id like 'web-prep-%'
    union all
    select 1 from public.prepared_meat_stock_movements where legacy_id like 'web-prep-%'
    union all
    select 1 from public.raw_meat_stock_movements where legacy_id like 'web-prep-%'
    union all
    select 1 from public.prepared_meat_items where legacy_id like 'web-prep-%'
  ) then
    raise exception 'web frozen-meat test cleanup was incomplete';
  end if;
end
$$;

commit;
