create table public.meat_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  unit text not null,
  multiplier numeric(14, 6) not null,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meat_calculation_settings (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  is_applied boolean not null default false,
  markup_rate numeric(10, 6),
  variation_rate numeric(10, 6),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meat_customers (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  customer_code text,
  name text not null,
  address text,
  phone text,
  contact_person text,
  delivery_note_required boolean not null default false,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index meat_customers_customer_code_idx
  on public.meat_customers (customer_code);

create table public.raw_meat_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  sku text,
  name text not null,
  english_name text,
  unit text,
  current_seasoning_cost numeric(14, 4),
  current_seasoning_code numeric(14, 4),
  current_markup_rate numeric(10, 6),
  current_variation_rate numeric(10, 6),
  sort_order numeric(14, 3),
  can_ship_directly boolean not null default false,
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index raw_meat_items_sku_idx on public.raw_meat_items (sku);

create table public.raw_meat_item_suppliers (
  id uuid primary key default gen_random_uuid(),
  raw_meat_item_id uuid not null references public.raw_meat_items (id),
  raw_meat_item_legacy_id text not null,
  supplier_id uuid not null references public.suppliers (id),
  supplier_legacy_id text not null,
  created_at timestamptz not null default now(),
  unique (raw_meat_item_id, supplier_id)
);

create index raw_meat_item_suppliers_raw_meat_item_id_idx
  on public.raw_meat_item_suppliers (raw_meat_item_id);
create index raw_meat_item_suppliers_supplier_id_idx
  on public.raw_meat_item_suppliers (supplier_id);

create table public.prepared_meat_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  raw_meat_item_id uuid references public.raw_meat_items (id),
  raw_meat_item_legacy_id text,
  sku text,
  name text not null,
  english_name text,
  unit text,
  kg_per_package numeric(14, 3),
  sort_order numeric(14, 3),
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index prepared_meat_items_raw_meat_item_id_idx
  on public.prepared_meat_items (raw_meat_item_id);
create index prepared_meat_items_sku_idx on public.prepared_meat_items (sku);

create table public.seasonings (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  description text,
  calculation_expression text,
  cost_per_gram numeric(14, 6),
  last_updated_at timestamptz,
  sort_order numeric(14, 3),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.meat_shipping_methods (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.meat_orders (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  meat_customer_id uuid references public.meat_customers (id),
  meat_customer_legacy_id text,
  shipping_method_id uuid references public.meat_shipping_methods (id),
  shipping_method_legacy_id text,
  order_number text,
  order_at timestamptz,
  shipping_at timestamptz,
  print_at timestamptz,
  sent_at timestamptz,
  send_to_factory boolean not null default false,
  remarks text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meat_orders_meat_customer_id_idx
  on public.meat_orders (meat_customer_id);
create index meat_orders_shipping_method_id_idx
  on public.meat_orders (shipping_method_id);
create index meat_orders_order_number_idx on public.meat_orders (order_number);

create table public.meat_order_lines (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  meat_order_id uuid references public.meat_orders (id),
  meat_order_legacy_id text,
  prepared_meat_item_id uuid references public.prepared_meat_items (id),
  prepared_meat_item_legacy_id text,
  raw_meat_item_id uuid references public.raw_meat_items (id),
  raw_meat_item_legacy_id text,
  quantity numeric(14, 3),
  sort_order numeric(14, 3),
  remarks text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meat_order_lines_meat_order_id_idx
  on public.meat_order_lines (meat_order_id);
create index meat_order_lines_prepared_meat_item_id_idx
  on public.meat_order_lines (prepared_meat_item_id);
create index meat_order_lines_raw_meat_item_id_idx
  on public.meat_order_lines (raw_meat_item_id);

create table public.raw_meat_stock_movements (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  raw_meat_item_id uuid references public.raw_meat_items (id),
  raw_meat_item_legacy_id text,
  supplier_id uuid references public.suppliers (id),
  supplier_legacy_id text,
  meat_order_line_id uuid references public.meat_order_lines (id),
  meat_order_line_legacy_id text,
  movement_at timestamptz,
  inbound_quantity_kg numeric(14, 3),
  outbound_quantity_kg numeric(14, 3),
  allocated_inbound_quantity_kg numeric(14, 3),
  inbound_unit_price numeric(14, 4),
  inbound_total_amount numeric(14, 2),
  applied_seasoning_cost numeric(14, 4),
  applied_seasoning_code numeric(14, 4),
  applied_markup_rate numeric(10, 6),
  applied_variation_rate numeric(10, 6),
  applied_seasoning_per_kg numeric(14, 4),
  raw_meat_order text,
  remarks text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);

create index raw_meat_stock_movements_raw_meat_item_id_idx
  on public.raw_meat_stock_movements (raw_meat_item_id);
create index raw_meat_stock_movements_supplier_id_idx
  on public.raw_meat_stock_movements (supplier_id);
create index raw_meat_stock_movements_meat_order_line_id_idx
  on public.raw_meat_stock_movements (meat_order_line_id);
create index raw_meat_stock_movements_movement_at_idx
  on public.raw_meat_stock_movements (movement_at);

create table public.raw_meat_stock_relations (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.raw_meat_stock_movements (id),
  movement_legacy_id text not null,
  inbound_movement_id uuid not null references public.raw_meat_stock_movements (id),
  inbound_movement_legacy_id text not null,
  created_at timestamptz not null default now(),
  unique (movement_id, inbound_movement_id)
);

create index raw_meat_stock_relations_movement_id_idx
  on public.raw_meat_stock_relations (movement_id);
create index raw_meat_stock_relations_inbound_movement_id_idx
  on public.raw_meat_stock_relations (inbound_movement_id);

create table public.prepared_meat_stock_movements (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  prepared_meat_item_id uuid references public.prepared_meat_items (id),
  prepared_meat_item_legacy_id text,
  meat_customer_id uuid references public.meat_customers (id),
  meat_customer_legacy_id text,
  meat_order_line_id uuid references public.meat_order_lines (id),
  meat_order_line_legacy_id text,
  movement_at timestamptz,
  inbound_packages numeric(14, 3),
  outbound_packages numeric(14, 3),
  prepared_meat_order numeric(14, 3),
  remarks text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);

create index prepared_meat_stock_movements_prepared_item_id_idx
  on public.prepared_meat_stock_movements (prepared_meat_item_id);
create index prepared_meat_stock_movements_customer_id_idx
  on public.prepared_meat_stock_movements (meat_customer_id);
create index prepared_meat_stock_movements_order_line_id_idx
  on public.prepared_meat_stock_movements (meat_order_line_id);
create index prepared_meat_stock_movements_movement_at_idx
  on public.prepared_meat_stock_movements (movement_at);

create table public.prepared_meat_stock_raw_sources (
  id uuid primary key default gen_random_uuid(),
  prepared_movement_id uuid not null
    references public.prepared_meat_stock_movements (id),
  prepared_movement_legacy_id text not null,
  raw_stock_movement_id uuid references public.raw_meat_stock_movements (id),
  raw_stock_movement_legacy_id text not null,
  created_at timestamptz not null default now(),
  unique (prepared_movement_id, raw_stock_movement_legacy_id)
);

create index prepared_meat_stock_raw_sources_prepared_idx
  on public.prepared_meat_stock_raw_sources (prepared_movement_id);
create index prepared_meat_stock_raw_sources_raw_idx
  on public.prepared_meat_stock_raw_sources (raw_stock_movement_id);

create table public.meat_seasoning_cost_versions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  prepared_meat_item_id uuid references public.prepared_meat_items (id),
  prepared_meat_item_legacy_id text,
  raw_meat_item_id uuid references public.raw_meat_items (id),
  raw_meat_item_legacy_id text,
  seasoning_id uuid references public.seasonings (id),
  seasoning_legacy_id text,
  production_raw_meat_kg numeric(14, 3),
  seasoning_quantity_grams numeric(14, 3),
  total_cost numeric(14, 4),
  unit_cost numeric(14, 6),
  version_code numeric(14, 4),
  seasoning_sort numeric(14, 3),
  is_applied boolean not null default false,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);

create index meat_seasoning_cost_versions_prepared_idx
  on public.meat_seasoning_cost_versions (prepared_meat_item_id);
create index meat_seasoning_cost_versions_raw_idx
  on public.meat_seasoning_cost_versions (raw_meat_item_id);
create index meat_seasoning_cost_versions_seasoning_idx
  on public.meat_seasoning_cost_versions (seasoning_id);

create table public.meat_price_versions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  raw_meat_item_id uuid references public.raw_meat_items (id),
  raw_meat_item_legacy_id text,
  month_at timestamptz,
  shop_price numeric(14, 4),
  room_price numeric(14, 4),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);

create index meat_price_versions_raw_meat_item_id_idx
  on public.meat_price_versions (raw_meat_item_id);
create index meat_price_versions_month_at_idx
  on public.meat_price_versions (month_at);

create table public.ingredient_stocktake_events (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  ingredient_id uuid references public.ingredients (id),
  ingredient_legacy_id text,
  stocktake_at timestamptz,
  quantity numeric(14, 3),
  sku_snapshot text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);

create index ingredient_stocktake_events_ingredient_id_idx
  on public.ingredient_stocktake_events (ingredient_id);
create index ingredient_stocktake_events_stocktake_at_idx
  on public.ingredient_stocktake_events (stocktake_at);

create table public.packing_stocktake_events (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  ingredient_id uuid references public.ingredients (id),
  ingredient_legacy_id text,
  stocktake_at timestamptz,
  quantity numeric(14, 3),
  sku_snapshot text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);

create index packing_stocktake_events_ingredient_id_idx
  on public.packing_stocktake_events (ingredient_id);
create index packing_stocktake_events_stocktake_at_idx
  on public.packing_stocktake_events (stocktake_at);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'meat_unit_conversions',
    'meat_calculation_settings',
    'meat_customers',
    'raw_meat_items',
    'raw_meat_item_suppliers',
    'prepared_meat_items',
    'seasonings',
    'meat_shipping_methods',
    'meat_orders',
    'meat_order_lines',
    'raw_meat_stock_movements',
    'raw_meat_stock_relations',
    'prepared_meat_stock_movements',
    'prepared_meat_stock_raw_sources',
    'meat_seasoning_cost_versions',
    'meat_price_versions',
    'ingredient_stocktake_events',
    'packing_stocktake_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated',
      table_name
    );
    execute format(
      'create policy "Production reads %1$s" on public.%1$I
       for select to authenticated
       using (
         ((select auth.jwt()) -> ''app_metadata'' ->> ''role'')
         in (''Super Admin'', ''Admin'', ''Factory'')
       )',
      table_name
    );
    execute format(
      'create policy "Administrators insert %1$s" on public.%1$I
       for insert to authenticated
       with check (
         ((select auth.jwt()) -> ''app_metadata'' ->> ''role'')
         in (''Super Admin'', ''Admin'')
       )',
      table_name
    );
    execute format(
      'create policy "Administrators update %1$s" on public.%1$I
       for update to authenticated
       using (
         ((select auth.jwt()) -> ''app_metadata'' ->> ''role'')
         in (''Super Admin'', ''Admin'')
       )
       with check (
         ((select auth.jwt()) -> ''app_metadata'' ->> ''role'')
         in (''Super Admin'', ''Admin'')
       )',
      table_name
    );
    execute format(
      'create policy "Administrators delete %1$s" on public.%1$I
       for delete to authenticated
       using (
         ((select auth.jwt()) -> ''app_metadata'' ->> ''role'')
         in (''Super Admin'', ''Admin'')
       )',
      table_name
    );
  end loop;
end;
$$;
