begin;

insert into ingredients(
  id, name, sku, stocktake_unit, is_ingredient_stocktake, is_packing_stocktake
) values (
  '10000000-0000-0000-0000-000000000099', 'Future reversal pack', 'FUTURE-PACK',
  'pack', false, true
);
insert into packing_stocktake_events(ingredient_id, quantity, stocktake_at)
values (
  '10000000-0000-0000-0000-000000000099', 39,
  timestamptz '2026-09-28 00:00:00+08'
);
insert into orders(id, order_number, delivery_at) values (
  '30000000-0000-0000-0000-000000000099', 'FUTURE-REVERSAL',
  timestamptz '2026-10-01 00:00:00+08'
);
insert into deliveries(id, order_id, delivery_at, delivery_status) values (
  '50000000-0000-0000-0000-000000000099',
  '30000000-0000-0000-0000-000000000099',
  timestamptz '2026-10-01 00:00:00+08', '準備中'
);
insert into order_lines(id, order_id, product_id, quantity, delivery_id) values (
  '40000000-0000-0000-0000-000000000099',
  '30000000-0000-0000-0000-000000000099',
  '20000000-0000-0000-0000-000000000001', 1,
  '50000000-0000-0000-0000-000000000099'
);
insert into order_material_consumptions(
  id, order_id, delivery_id, order_line_id, ingredient_id, quantity,
  consumed_at, calculation_source, reversed_at, reversal_reason
) values (
  '60000000-0000-0000-0000-000000000099',
  '30000000-0000-0000-0000-000000000099',
  '50000000-0000-0000-0000-000000000099',
  '40000000-0000-0000-0000-000000000099',
  '10000000-0000-0000-0000-000000000099', 1,
  timestamptz '2026-10-01 00:00:00+08', 'product_bom',
  timestamptz '2026-09-28 15:36:00+08', 'delivery_changed'
);

select pg_temp.assert_equal(
  private.material_inventory_current_balance(
    'packing', '10000000-0000-0000-0000-000000000099',
    timestamptz '2026-09-28 16:00:00+08'
  ),
  39,
  'future consumption reversal does not create current stock'
);

select pg_temp.assert_equal(
  private.material_inventory_current_balance(
    'packing', '10000000-0000-0000-0000-000000000099',
    timestamptz '2026-10-01 01:00:00+08'
  ),
  39,
  'future reversed consumption nets to zero when it becomes effective'
);

do $$
declare
  v_reversal_at timestamptz;
begin
  select occurred_at into v_reversal_at
  from public.material_inventory_ledger(
    'packing', '10000000-0000-0000-0000-000000000099'
  )
  where movement_type = 'adjustment' and is_reversal;
  if v_reversal_at is distinct from timestamptz '2026-10-01 00:00:00+08' then
    raise exception 'future reversal ledger time: expected %, got %',
      timestamptz '2026-10-01 00:00:00+08', v_reversal_at;
  end if;
end;
$$;

rollback;

