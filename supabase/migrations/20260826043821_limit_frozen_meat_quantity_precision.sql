-- Keep frozen-meat quantities at two decimal places.
-- The USING clauses also normalize legacy values before enforcing the
-- precision through the column type for future UI, RPC, and import writes.

alter table public.prepared_meat_items
  alter column kg_per_package type numeric(14, 2)
  using round(kg_per_package, 2);

alter table public.meat_order_lines
  alter column quantity type numeric(14, 2)
  using round(quantity, 2);

alter table public.raw_meat_stock_movements
  alter column inbound_quantity_kg type numeric(14, 2)
  using round(inbound_quantity_kg, 2),
  alter column outbound_quantity_kg type numeric(14, 2)
  using round(outbound_quantity_kg, 2),
  alter column allocated_inbound_quantity_kg type numeric(14, 2)
  using round(allocated_inbound_quantity_kg, 2);

drop trigger if exists trg_sync_yield_error_from_inbound
  on public.prepared_meat_stock_movements;

alter table public.prepared_meat_stock_movements
  alter column inbound_packages type numeric(14, 2)
  using round(inbound_packages, 2),
  alter column outbound_packages type numeric(14, 2)
  using round(outbound_packages, 2),
  alter column prepared_meat_order type numeric(14, 2)
  using round(prepared_meat_order, 2);

alter table public.meat_seasoning_cost_versions
  alter column production_raw_meat_kg type numeric(14, 2)
  using round(production_raw_meat_kg, 2);

alter table public.meat_yield_errors
  alter column raw_input_kg type numeric(14, 2)
  using round(raw_input_kg, 2),
  alter column kg_per_package type numeric(14, 2)
  using round(kg_per_package, 2),
  alter column expected_output_kg type numeric(14, 2)
  using round(expected_output_kg, 2),
  alter column actual_packs type numeric(14, 2)
  using round(actual_packs, 2),
  alter column actual_output_kg type numeric(14, 2)
  using round(actual_output_kg, 2),
  alter column deviation_packs type numeric(14, 2)
  using round(deviation_packs, 2);

create trigger trg_sync_yield_error_from_inbound
after update of inbound_packages
on public.prepared_meat_stock_movements
for each row
execute function private.trg_sync_yield_error_from_inbound();
