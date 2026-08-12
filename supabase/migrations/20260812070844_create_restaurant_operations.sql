create table public.restaurant_payment_methods (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  sort_order numeric(14, 3),
  deducts_petty_cash boolean not null default false,
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.restaurant_service_periods (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  sort_order numeric(14, 3),
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.restaurant_delivery_platforms (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  sort_order numeric(14, 3),
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.restaurant_new_products (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  remarks_enabled boolean not null default false,
  remarks_placeholder text,
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.restaurant_cost_types (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  sort_order numeric(14, 3),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.restaurant_costs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  cost_type_id uuid references public.restaurant_cost_types (id),
  cost_type_legacy_id text,
  name text not null,
  sort_order numeric(14, 3),
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index restaurant_costs_cost_type_id_idx
  on public.restaurant_costs (cost_type_id);

create table public.restaurant_purchase_types (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  sort_order numeric(14, 3),
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.restaurant_ingredients (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  supplier_id uuid references public.suppliers (id),
  supplier_legacy_id text,
  name text not null,
  unit text,
  cost_per_unit numeric(14, 4),
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index restaurant_ingredients_supplier_id_idx
  on public.restaurant_ingredients (supplier_id);

create table public.restaurant_ingredient_departments (
  id uuid primary key default gen_random_uuid(),
  restaurant_ingredient_id uuid not null
    references public.restaurant_ingredients (id),
  restaurant_ingredient_legacy_id text not null,
  department_name text not null,
  created_at timestamptz not null default now(),
  unique (restaurant_ingredient_id, department_name)
);
create index restaurant_ingredient_departments_ingredient_id_idx
  on public.restaurant_ingredient_departments (restaurant_ingredient_id);

create table public.restaurant_daily_sales (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  restaurant_id uuid references public.restaurants (id),
  restaurant_legacy_id text,
  payment_method_id uuid references public.restaurant_payment_methods (id),
  payment_method_legacy_id text,
  service_period_id uuid references public.restaurant_service_periods (id),
  service_period_legacy_id text,
  restaurant_department_id uuid references public.restaurant_departments (id),
  restaurant_department_legacy_id text,
  delivery_platform_id uuid references public.restaurant_delivery_platforms (id),
  delivery_platform_legacy_id text,
  new_product_id uuid references public.restaurant_new_products (id),
  new_product_legacy_id text,
  sales_at timestamptz,
  amount numeric(14, 2),
  quantity numeric(14, 3),
  sort_order numeric(14, 3),
  is_control_total boolean not null default false,
  is_remark_section boolean not null default false,
  has_image boolean not null default false,
  image_url text,
  pos_sheet_url text,
  petty_cash boolean not null default false,
  petty_cash_amount numeric(14, 2),
  remarks text,
  real_cash_count_amount numeric(14, 2),
  real_cash_count numeric(14, 3),
  manager_hours_department text,
  working_hours numeric(14, 3),
  average_per_working_hour numeric(14, 4),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index restaurant_daily_sales_restaurant_id_idx
  on public.restaurant_daily_sales (restaurant_id);
create index restaurant_daily_sales_payment_method_id_idx
  on public.restaurant_daily_sales (payment_method_id);
create index restaurant_daily_sales_service_period_id_idx
  on public.restaurant_daily_sales (service_period_id);
create index restaurant_daily_sales_department_id_idx
  on public.restaurant_daily_sales (restaurant_department_id);
create index restaurant_daily_sales_delivery_platform_id_idx
  on public.restaurant_daily_sales (delivery_platform_id);
create index restaurant_daily_sales_new_product_id_idx
  on public.restaurant_daily_sales (new_product_id);
create index restaurant_daily_sales_sales_at_idx
  on public.restaurant_daily_sales (sales_at);

create table public.restaurant_monthly_costs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  restaurant_id uuid references public.restaurants (id),
  restaurant_legacy_id text,
  cost_id uuid references public.restaurant_costs (id),
  cost_legacy_id text,
  cost_type_id uuid references public.restaurant_cost_types (id),
  cost_type_legacy_id text,
  month_at timestamptz,
  amount numeric(14, 2),
  cost_type_sort numeric(14, 3),
  can_proceed_pnl boolean not null default false,
  remarks text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index restaurant_monthly_costs_restaurant_id_idx
  on public.restaurant_monthly_costs (restaurant_id);
create index restaurant_monthly_costs_cost_id_idx
  on public.restaurant_monthly_costs (cost_id);
create index restaurant_monthly_costs_cost_type_id_idx
  on public.restaurant_monthly_costs (cost_type_id);
create index restaurant_monthly_costs_month_at_idx
  on public.restaurant_monthly_costs (month_at);

create table public.restaurant_stocktake_events (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  restaurant_id uuid references public.restaurants (id),
  restaurant_legacy_id text,
  restaurant_ingredient_id uuid references public.restaurant_ingredients (id),
  restaurant_ingredient_legacy_id text,
  supplier_id uuid references public.suppliers (id),
  supplier_legacy_id text,
  department_name text,
  stocktake_at timestamptz,
  quantity numeric(14, 3),
  unit_cost numeric(14, 4),
  total_cost numeric(14, 2),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index restaurant_stocktake_events_restaurant_id_idx
  on public.restaurant_stocktake_events (restaurant_id);
create index restaurant_stocktake_events_ingredient_id_idx
  on public.restaurant_stocktake_events (restaurant_ingredient_id);
create index restaurant_stocktake_events_supplier_id_idx
  on public.restaurant_stocktake_events (supplier_id);
create index restaurant_stocktake_events_stocktake_at_idx
  on public.restaurant_stocktake_events (stocktake_at);

create table public.restaurant_supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  restaurant_id uuid references public.restaurants (id),
  restaurant_legacy_id text,
  supplier_id uuid references public.suppliers (id),
  supplier_legacy_id text,
  purchase_type_id uuid references public.restaurant_purchase_types (id),
  purchase_type_legacy_id text,
  purchased_at timestamptz,
  amount numeric(14, 2),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index restaurant_supplier_purchases_restaurant_id_idx
  on public.restaurant_supplier_purchases (restaurant_id);
create index restaurant_supplier_purchases_supplier_id_idx
  on public.restaurant_supplier_purchases (supplier_id);
create index restaurant_supplier_purchases_purchase_type_id_idx
  on public.restaurant_supplier_purchases (purchase_type_id);
create index restaurant_supplier_purchases_purchased_at_idx
  on public.restaurant_supplier_purchases (purchased_at);

create table public.restaurant_holidays (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text,
  starts_at timestamptz,
  ends_at timestamptz,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.restaurant_staff (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  restaurant_id uuid references public.restaurants (id),
  restaurant_legacy_id text,
  display_name text not null,
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index restaurant_staff_restaurant_id_idx
  on public.restaurant_staff (restaurant_id);

create table public.restaurant_time_slots (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  service_period_id uuid references public.restaurant_service_periods (id),
  service_period_legacy_id text,
  starts_at time,
  ends_at time,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index restaurant_time_slots_service_period_id_idx
  on public.restaurant_time_slots (service_period_id);

create table public.restaurant_rosters (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  restaurant_id uuid references public.restaurants (id),
  restaurant_legacy_id text,
  staff_id uuid references public.restaurant_staff (id),
  staff_legacy_id text,
  holiday_id uuid references public.restaurant_holidays (id),
  holiday_legacy_id text,
  time_slot_id uuid references public.restaurant_time_slots (id),
  time_slot_legacy_id text,
  service_period_id uuid references public.restaurant_service_periods (id),
  service_period_legacy_id text,
  roster_at timestamptz,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index restaurant_rosters_restaurant_id_idx
  on public.restaurant_rosters (restaurant_id);
create index restaurant_rosters_staff_id_idx
  on public.restaurant_rosters (staff_id);
create index restaurant_rosters_holiday_id_idx
  on public.restaurant_rosters (holiday_id);
create index restaurant_rosters_time_slot_id_idx
  on public.restaurant_rosters (time_slot_id);
create index restaurant_rosters_service_period_id_idx
  on public.restaurant_rosters (service_period_id);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'restaurant_payment_methods','restaurant_service_periods',
    'restaurant_delivery_platforms','restaurant_new_products',
    'restaurant_cost_types','restaurant_costs','restaurant_purchase_types',
    'restaurant_ingredients','restaurant_ingredient_departments',
    'restaurant_daily_sales','restaurant_monthly_costs',
    'restaurant_stocktake_events','restaurant_supplier_purchases',
    'restaurant_holidays','restaurant_staff','restaurant_time_slots',
    'restaurant_rosters'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated',table_name);
    execute format(
      'create policy "Restaurant reads %1$s" on public.%1$I for select to authenticated
       using (((select auth.jwt())->''app_metadata''->>''role'')
       in (''Super Admin'',''Admin'',''Accounting'',''Shop manager''))',
      table_name
    );
    execute format(
      'create policy "Administrators insert %1$s" on public.%1$I for insert to authenticated
       with check (((select auth.jwt())->''app_metadata''->>''role'')
       in (''Super Admin'',''Admin''))',
      table_name
    );
    execute format(
      'create policy "Administrators update %1$s" on public.%1$I for update to authenticated
       using (((select auth.jwt())->''app_metadata''->>''role'')
       in (''Super Admin'',''Admin''))
       with check (((select auth.jwt())->''app_metadata''->>''role'')
       in (''Super Admin'',''Admin''))',
      table_name
    );
    execute format(
      'create policy "Administrators delete %1$s" on public.%1$I for delete to authenticated
       using (((select auth.jwt())->''app_metadata''->>''role'')
       in (''Super Admin'',''Admin''))',
      table_name
    );
  end loop;
end $$;
