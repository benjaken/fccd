-- Fixed-snapshot package calculations, quote children, comments, tags, and
-- file metadata. File bytes are intentionally not copied.

create table public.package_choice_sets (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  package_id uuid references public.packages(id),
  package_legacy_id text,
  choice_type text,
  maximum_choices numeric(14,3),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index package_choice_sets_package_id_idx on public.package_choice_sets(package_id);

create table public.production_calculations (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  order_id uuid references public.orders(id),
  order_legacy_id text,
  package_id uuid references public.packages(id),
  package_legacy_id text,
  package_choice_set_id uuid references public.package_choice_sets(id),
  package_choice_set_legacy_id text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index production_calculations_order_id_idx on public.production_calculations(order_id);
create index production_calculations_package_id_idx on public.production_calculations(package_id);
create index production_calculations_choice_set_id_idx on public.production_calculations(package_choice_set_id);

create table public.order_package_choice_snapshots (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  production_calculation_id uuid references public.production_calculations(id),
  production_calculation_legacy_id text,
  order_id uuid references public.orders(id),
  order_legacy_id text,
  package_id uuid references public.packages(id),
  package_legacy_id text,
  package_product_id uuid references public.package_products(id),
  package_product_legacy_id text,
  package_choice_set_id uuid references public.package_choice_sets(id),
  package_choice_set_legacy_id text,
  product_type_id uuid references public.product_types(id),
  product_type_legacy_id text,
  maximum_choices numeric(14,3),
  is_selected boolean not null default false,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index order_package_choice_snapshots_calculation_id_idx
  on public.order_package_choice_snapshots(production_calculation_id);
create index order_package_choice_snapshots_order_id_idx
  on public.order_package_choice_snapshots(order_id);
create index order_package_choice_snapshots_package_id_idx
  on public.order_package_choice_snapshots(package_id);
create index order_package_choice_snapshots_package_product_id_idx
  on public.order_package_choice_snapshots(package_product_id);
create index order_package_choice_snapshots_choice_set_id_idx
  on public.order_package_choice_snapshots(package_choice_set_id);
create index order_package_choice_snapshots_product_type_id_idx
  on public.order_package_choice_snapshots(product_type_id);

create table public.order_bento_additional_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  order_id uuid references public.orders(id),
  order_legacy_id text,
  additional_item_id uuid references public.bento_additional_items(id),
  additional_item_legacy_id text,
  description_snapshot text,
  sort_order numeric(14,3),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index order_bento_additional_items_order_id_idx on public.order_bento_additional_items(order_id);
create index order_bento_additional_items_item_id_idx on public.order_bento_additional_items(additional_item_id);

create table public.order_bento_event_parts (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  order_id uuid references public.orders(id),
  order_legacy_id text,
  event_part_id uuid references public.bento_event_parts(id),
  event_part_legacy_id text,
  description_snapshot text,
  price_snapshot numeric(14,2),
  sort_order numeric(14,3),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index order_bento_event_parts_order_id_idx on public.order_bento_event_parts(order_id);
create index order_bento_event_parts_part_id_idx on public.order_bento_event_parts(event_part_id);

create table public.order_payment_method_snapshots (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  order_id uuid references public.orders(id),
  order_legacy_id text,
  content text not null,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index order_payment_method_snapshots_order_id_idx
  on public.order_payment_method_snapshots(order_id);

create table public.order_terms_snapshots (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  order_id uuid references public.orders(id),
  order_legacy_id text,
  content text not null,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index order_terms_snapshots_order_id_idx on public.order_terms_snapshots(order_id);

create table public.order_timeline_entries (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  order_id uuid references public.orders(id),
  order_legacy_id text,
  category text,
  comment text not null,
  customer_email_snapshot text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index order_timeline_entries_order_id_idx on public.order_timeline_entries(order_id);

create table public.customer_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  customer_id uuid references public.customers(id),
  customer_email_snapshot text,
  customer_tag_id uuid references public.customer_tags(id),
  customer_tag_legacy_id text,
  customer_tag_type_id uuid references public.customer_tag_types(id),
  customer_tag_type_legacy_id text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index customer_tag_assignments_customer_id_idx on public.customer_tag_assignments(customer_id);
create index customer_tag_assignments_tag_id_idx on public.customer_tag_assignments(customer_tag_id);
create index customer_tag_assignments_type_id_idx on public.customer_tag_assignments(customer_tag_type_id);

create table public.quote_file_metadata (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  order_id uuid references public.orders(id),
  order_legacy_id text,
  display_name text,
  source_file_reference text,
  source_file_name text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.quote_file_metadata is
  'Bubble file metadata only. No file content, credentials, or signed access tokens are stored.';
create index quote_file_metadata_order_id_idx on public.quote_file_metadata(order_id);

do $$
declare t text;
begin
  foreach t in array array[
    'package_choice_sets','production_calculations',
    'order_package_choice_snapshots','order_bento_additional_items',
    'order_bento_event_parts','order_payment_method_snapshots',
    'order_terms_snapshots','order_timeline_entries',
    'customer_tag_assignments','quote_file_metadata'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "Operations reads %1$s" on public.%1$I for select to authenticated
       using (((select auth.jwt())->''app_metadata''->>''role'') in
       (''Super Admin'',''Admin'',''Accounting'',''Factory''))', t);
    execute format(
      'create policy "Administrators insert %1$s" on public.%1$I for insert to authenticated
       with check (((select auth.jwt())->''app_metadata''->>''role'') in (''Super Admin'',''Admin''))', t);
    execute format(
      'create policy "Administrators update %1$s" on public.%1$I for update to authenticated
       using (((select auth.jwt())->''app_metadata''->>''role'') in (''Super Admin'',''Admin''))
       with check (((select auth.jwt())->''app_metadata''->>''role'') in (''Super Admin'',''Admin''))', t);
    execute format(
      'create policy "Administrators delete %1$s" on public.%1$I for delete to authenticated
       using (((select auth.jwt())->''app_metadata''->>''role'') in (''Super Admin'',''Admin''))', t);
  end loop;
end $$;
