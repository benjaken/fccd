create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  supplier_id uuid references public.suppliers (id),
  supplier_legacy_id text,
  sku text,
  name text not null,
  description text,
  ingredient_type text,
  product_unit text,
  stocktake_unit text,
  product_quantity numeric(14, 3),
  cost_per_product_unit numeric(14, 4),
  cost_per_stocktake_unit numeric(14, 4),
  is_ingredient_stocktake boolean,
  is_packing_stocktake boolean,
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index ingredients_supplier_id_idx on public.ingredients (supplier_id);
create index ingredients_sku_idx on public.ingredients (sku);

create table public.packing_materials (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.product_ingredients (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  ingredient_id uuid references public.ingredients (id),
  ingredient_legacy_id text,
  product_id uuid references public.products (id),
  product_legacy_id text,
  package_id uuid references public.packages (id),
  package_legacy_id text,
  quantity numeric(14, 3),
  test_quantity numeric(14, 3),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_ingredients_ingredient_id_idx
  on public.product_ingredients (ingredient_id);
create index product_ingredients_product_id_idx
  on public.product_ingredients (product_id);
create index product_ingredients_package_id_idx
  on public.product_ingredients (package_id);

create table public.order_bom_requirements (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  order_id uuid references public.orders (id),
  order_legacy_id text,
  order_line_id uuid references public.order_lines (id),
  order_line_legacy_id text,
  product_id uuid references public.products (id),
  product_legacy_id text,
  ingredient_id uuid references public.ingredients (id),
  ingredient_legacy_id text,
  delivery_at timestamptz,
  ingredient_quantity numeric(14, 3),
  product_quantity numeric(14, 3),
  calculated_quantity numeric(14, 3),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_bom_requirements_order_id_idx
  on public.order_bom_requirements (order_id);
create index order_bom_requirements_order_line_id_idx
  on public.order_bom_requirements (order_line_id);
create index order_bom_requirements_product_id_idx
  on public.order_bom_requirements (product_id);
create index order_bom_requirements_ingredient_id_idx
  on public.order_bom_requirements (ingredient_id);

create table public.data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  issue_type text not null,
  source_type text not null,
  source_legacy_id text not null,
  source_field text not null,
  target_type text,
  target_legacy_id text,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'accepted')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (issue_type, source_type, source_legacy_id, source_field)
);

create index data_quality_issues_status_idx
  on public.data_quality_issues (status, source_type);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ingredients',
    'packing_materials',
    'product_ingredients',
    'order_bom_requirements'
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

alter table public.data_quality_issues enable row level security;
grant select, insert, update, delete
  on public.data_quality_issues
  to authenticated;

create policy "Administrators manage data quality issues"
on public.data_quality_issues
for all
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
)
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
);
