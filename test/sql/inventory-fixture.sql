-- Minimal dependency contract; the code under test is the actual migrations.
create schema private;
create schema auth;
create role anon;
create role authenticated;
create role service_role;
create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
create function private.has_page_access(text) returns boolean language sql as $$ select coalesce(current_setting('test.authorized', true), 'true') <> 'false' $$;
create function private.has_page_manage(text) returns boolean language sql as $$ select private.has_page_access($1) $$;
create function private.refresh_minimum_after_material_consumption() returns trigger language plpgsql as $$ begin return null; end; $$;

create table orders (
  id uuid primary key default gen_random_uuid(), document_type text default 'order',
  archived_at timestamptz, merged_into_order_id uuid, delivery_status text,
  order_number text, delivery_at timestamptz, created_at timestamptz default now()
);
create table deliveries (
  id uuid primary key default gen_random_uuid(), order_id uuid references orders,
  delivery_at timestamptz, fulfilled_at timestamptz, delivery_status text,
  updated_at timestamptz default now()
);
create table products (id uuid primary key default gen_random_uuid(), name text, sku text);
create table ingredients (
  id uuid primary key default gen_random_uuid(), name text, sku text,
  product_unit text, stocktake_unit text, product_quantity numeric,
  is_packing_stocktake boolean default false, is_ingredient_stocktake boolean default true
);
create table order_lines (
  id uuid primary key default gen_random_uuid(), order_id uuid references orders,
  product_id uuid references products, package_id uuid, quantity numeric,
  delivery_id uuid references deliveries on delete set null, delivery_at timestamptz, is_void boolean default false,
  item_order numeric, product_name_snapshot text, content_snapshot text, sku_snapshot text
);
create table product_ingredients (
  id uuid primary key default gen_random_uuid(), product_id uuid, package_id uuid,
  ingredient_id uuid references ingredients, quantity numeric, test_quantity numeric
);
create table order_bom_requirements (
  id uuid primary key default gen_random_uuid(), order_id uuid, order_line_id uuid references order_lines,
  ingredient_id uuid references ingredients, calculated_quantity numeric, ingredient_quantity numeric, product_quantity numeric
);
create table package_products (
  id uuid primary key default gen_random_uuid(), package_id uuid, product_id uuid, quantity numeric, is_selected boolean
);
create table order_package_choice_snapshots (
  id uuid primary key default gen_random_uuid(), order_id uuid, order_line_id uuid,
  package_product_id uuid, package_id uuid, is_selected boolean
);
create table order_list_manual_todos (id uuid primary key default gen_random_uuid(), order_id uuid, todo_key text);
create table order_material_consumptions (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders,
  delivery_id uuid not null references deliveries, order_line_id uuid not null references order_lines,
  ingredient_id uuid not null references ingredients, quantity numeric(14,3) not null check(quantity > 0),
  consumed_at timestamptz not null, calculation_source text not null check(calculation_source in ('order_bom','product_bom','package_bom')),
  metadata jsonb default '{}', created_at timestamptz default now(), unique(order_line_id,ingredient_id)
);
create table shop_order_requests (
  id uuid primary key default gen_random_uuid(), request_no text, channel text, status text, delivery_date date
);
create table shop_catalog_items (
  id uuid primary key default gen_random_uuid(), ingredient_id uuid references ingredients,
  sku text, name text, unit text, stocktake_kind text, warehouse text, stocktake_quantity_per_unit numeric default 1
);
create table shop_order_lines (
  id uuid primary key default gen_random_uuid(), request_id uuid references shop_order_requests,
  catalog_item_id uuid references shop_catalog_items, quantity numeric, sku text, name text
);
create table ingredient_stocktake_events (
  id uuid primary key default gen_random_uuid(), ingredient_id uuid, quantity numeric,
  stocktake_at timestamptz, created_at timestamptz default now(), entry_type text default 'stocktake', legacy_id text, correction_reason text
);
create table packing_stocktake_events (like ingredient_stocktake_events including all);
create table shop_dry_stock_movements (
  id uuid primary key default gen_random_uuid(), catalog_item_id uuid, movement_type text,
  quantity numeric, occurred_at timestamptz, source_type text, source_id uuid, remarks text
);
create function public.inventory_item_balance(text, uuid) returns jsonb language plpgsql as $$
declare stock numeric; kind text;
begin
  select case when is_packing_stocktake then 'packing' else 'ingredient' end into kind from ingredients where id=$2;
  stock := private.material_inventory_current_balance(kind, $2, now());
  return jsonb_build_object('mapped', true, 'hasLedger',stock is not null,'balance',stock);
end;
$$;
