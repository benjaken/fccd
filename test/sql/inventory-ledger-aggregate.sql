begin;

-- Two order lines on the same delivery must appear as one ledger row for the
-- shared ingredient, with quantities summed. Use a non-committed delivery
-- status so reconcile triggers do not insert extra rows.
insert into orders(id, order_number, delivery_at)
values ('30000000-0000-0000-0000-000000000156', 'B-1556-TEST', timestamptz '2026-09-13 16:00:00+00');
insert into deliveries(id, order_id, delivery_at, delivery_status) values
  ('50000000-0000-0000-0000-000000000156', '30000000-0000-0000-0000-000000000156',
   timestamptz '2026-09-13 16:00:00+00', '準備中');
insert into order_lines(id, order_id, product_id, quantity, delivery_id) values
  ('40000000-0000-0000-0000-000000000156', '30000000-0000-0000-0000-000000000156',
   '20000000-0000-0000-0000-000000000001', 9, '50000000-0000-0000-0000-000000000156'),
  ('40000000-0000-0000-0000-000000000157', '30000000-0000-0000-0000-000000000156',
   '20000000-0000-0000-0000-000000000001', 9, '50000000-0000-0000-0000-000000000156');
insert into order_material_consumptions(
  id, order_id, delivery_id, order_line_id, ingredient_id, quantity,
  consumed_at, calculation_source
) values
  ('60000000-0000-0000-0000-000000000156',
   '30000000-0000-0000-0000-000000000156',
   '50000000-0000-0000-0000-000000000156',
   '40000000-0000-0000-0000-000000000156',
   '41be0a73-850b-45d6-8f72-42ec107e3992',
   0.45, timestamptz '2026-09-13 16:00:00+00', 'order_bom'),
  ('60000000-0000-0000-0000-000000000157',
   '30000000-0000-0000-0000-000000000156',
   '50000000-0000-0000-0000-000000000156',
   '40000000-0000-0000-0000-000000000157',
   '41be0a73-850b-45d6-8f72-42ec107e3992',
   0.45, timestamptz '2026-09-13 16:00:00+00', 'order_bom');

select pg_temp.assert_equal(
  (select count(*) from material_inventory_ledger(
    'ingredient', '41be0a73-850b-45d6-8f72-42ec107e3992'
  ) where reference = 'B-1556-TEST' and is_reversal is false),
  1,
  'same-order line consumptions collapse to one ledger row'
);

select pg_temp.assert_equal(
  (select quantity from material_inventory_ledger(
    'ingredient', '41be0a73-850b-45d6-8f72-42ec107e3992'
  ) where reference = 'B-1556-TEST' and is_reversal is false),
  -0.9,
  'aggregated ledger quantity sums both order lines'
);

rollback;
