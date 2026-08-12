-- Fixed-snapshot prerequisite lookups and normalized product/order links.
-- Bubble Created By values are deliberately excluded.

create table public.bento_main_ingredients (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.bento_main_types (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.bento_column_types (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.bento_special_requests (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.bento_additional_items (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  description text not null, bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.bento_event_parts (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  description text not null, bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.product_collections (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  channel_id uuid references public.channels(id), channel_legacy_id text,
  name text not null, sort_order numeric(14,3),
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index product_collections_channel_id_idx on public.product_collections(channel_id);
create table public.cook_types (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, workload_score numeric(14,3),
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.cost_types (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, is_active boolean not null default true,
  is_advertising boolean not null default false, is_brand boolean not null default false,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.customer_tag_types (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, is_active boolean not null default true,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.customer_tags (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  customer_tag_type_id uuid references public.customer_tag_types(id),
  customer_tag_type_legacy_id text, name text not null,
  is_active boolean not null default true,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index customer_tags_type_id_idx on public.customer_tags(customer_tag_type_id);
create table public.delivery_surcharge_types (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, is_active boolean not null default true,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.festivals (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, is_active boolean not null default true,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.purchase_types (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, is_active boolean not null default true,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.quote_delivery_templates (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  content text not null, is_editable boolean not null default false,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.quote_payment_templates (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  content text not null, is_editable boolean not null default false,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.quote_terms_templates (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  content text not null, is_editable boolean not null default false,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.sales_partners (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, phone text, is_active boolean not null default true,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.delivery_team_drivers (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  delivery_team_id uuid references public.delivery_teams(id),
  delivery_team_legacy_id text, display_name text not null,
  is_active boolean not null default true,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index delivery_team_drivers_team_id_idx on public.delivery_team_drivers(delivery_team_id);
create table public.product_types (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  channel_id uuid references public.channels(id), channel_legacy_id text,
  name text not null, sort_order numeric(14,3),
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index product_types_channel_id_idx on public.product_types(channel_id);
create table public.order_block_dates (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  blocked_at timestamptz not null, bubble_created_at timestamptz,
  bubble_modified_at timestamptz, created_at timestamptz not null default now()
);
create table public.channel_products (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  channel_id uuid references public.channels(id), channel_legacy_id text,
  product_id uuid references public.products(id), product_legacy_id text,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index channel_products_channel_id_idx on public.channel_products(channel_id);
create index channel_products_product_id_idx on public.channel_products(product_id);
create table public.quote_communication_channels (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, is_active boolean not null default true,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.quote_first_reminder_contacts (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, phone text, reminder_hours numeric(14,3),
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.quote_second_reminder_contacts (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, phone text, reminder_hours numeric(14,3),
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.quote_sales_sources (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text not null, is_active boolean not null default true,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.product_tags (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text, bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.osdriver_menus (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  name text, bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.print_labels (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  order_id uuid references public.orders(id), order_legacy_id text,
  display_name text, bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index print_labels_order_id_idx on public.print_labels(order_id);

create table public.product_labels (
  id uuid primary key default gen_random_uuid(), legacy_id text not null unique,
  product_id uuid references public.products(id), product_legacy_id text,
  packing_material_id uuid references public.packing_materials(id),
  packing_material_legacy_id text, display_name text, quantity_label text,
  bubble_created_at timestamptz, bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index product_labels_product_id_idx on public.product_labels(product_id);
create index product_labels_packing_id_idx on public.product_labels(packing_material_id);

alter table public.products
  add column cook_type_id uuid references public.cook_types(id),
  add column cook_type_legacy_id text,
  add column product_type_id uuid references public.product_types(id),
  add column product_type_legacy_id text,
  add column bento_main_type_id uuid references public.bento_main_types(id),
  add column bento_main_type_legacy_id text,
  add column bento_column_type_id uuid references public.bento_column_types(id),
  add column bento_column_type_legacy_id text,
  add column is_bento_recommended boolean not null default false;
create index products_cook_type_id_idx on public.products(cook_type_id);
create index products_product_type_id_idx on public.products(product_type_id);
create index products_bento_main_type_id_idx on public.products(bento_main_type_id);
create index products_bento_column_type_id_idx on public.products(bento_column_type_id);

create table public.product_collection_links (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
  collection_id uuid references public.product_collections(id),
  product_legacy_id text not null, collection_legacy_id text not null,
  created_at timestamptz not null default now(), unique(product_id, collection_legacy_id)
);
create index product_collection_links_product_id_idx on public.product_collection_links(product_id);
create index product_collection_links_collection_id_idx on public.product_collection_links(collection_id);
create table public.product_main_ingredient_links (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
  main_ingredient_id uuid references public.bento_main_ingredients(id),
  product_legacy_id text not null, main_ingredient_legacy_id text not null,
  created_at timestamptz not null default now(), unique(product_id, main_ingredient_legacy_id)
);
create index product_main_ingredient_links_product_id_idx on public.product_main_ingredient_links(product_id);
create index product_main_ingredient_links_ingredient_id_idx on public.product_main_ingredient_links(main_ingredient_id);
create table public.product_special_request_links (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
  special_request_id uuid references public.bento_special_requests(id),
  product_legacy_id text not null, special_request_legacy_id text not null,
  created_at timestamptz not null default now(), unique(product_id, special_request_legacy_id)
);
create index product_special_request_links_product_id_idx on public.product_special_request_links(product_id);
create index product_special_request_links_request_id_idx on public.product_special_request_links(special_request_id);
create table public.product_tag_links (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
  product_tag_id uuid references public.product_tags(id),
  product_legacy_id text not null, product_tag_legacy_id text not null,
  created_at timestamptz not null default now(), unique(product_id, product_tag_legacy_id)
);
create index product_tag_links_product_id_idx on public.product_tag_links(product_id);
create index product_tag_links_tag_id_idx on public.product_tag_links(product_tag_id);

alter table public.orders
  add column festival_id uuid references public.festivals(id),
  add column festival_legacy_id text,
  add column sales_partner_id uuid references public.sales_partners(id),
  add column sales_partner_legacy_id text,
  add column quote_communication_channel_id uuid references public.quote_communication_channels(id),
  add column quote_communication_channel_legacy_id text,
  add column quote_delivery_template_id uuid references public.quote_delivery_templates(id),
  add column quote_delivery_template_legacy_id text,
  add column quote_sales_source_id uuid references public.quote_sales_sources(id),
  add column quote_sales_source_legacy_id text;
create index orders_festival_id_idx on public.orders(festival_id);
create index orders_sales_partner_id_idx on public.orders(sales_partner_id);
create index orders_quote_communication_channel_id_idx on public.orders(quote_communication_channel_id);
create index orders_quote_delivery_template_id_idx on public.orders(quote_delivery_template_id);
create index orders_quote_sales_source_id_idx on public.orders(quote_sales_source_id);

do $$
declare t text;
begin
  foreach t in array array[
    'bento_main_ingredients','bento_main_types','bento_column_types',
    'bento_special_requests','bento_additional_items','bento_event_parts',
    'product_collections','cook_types','cost_types','customer_tag_types',
    'customer_tags','delivery_surcharge_types','festivals','purchase_types',
    'quote_delivery_templates','quote_payment_templates','quote_terms_templates',
    'sales_partners','delivery_team_drivers','product_types','order_block_dates',
    'channel_products','quote_communication_channels',
    'quote_first_reminder_contacts','quote_second_reminder_contacts',
    'quote_sales_sources','product_tags','osdriver_menus','print_labels',
    'product_labels','product_collection_links','product_main_ingredient_links',
    'product_special_request_links','product_tag_links'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "Operations reads %1$s" on public.%1$I for select to authenticated
       using (((select auth.jwt())->''app_metadata''->>''role'') in
       (''Super Admin'',''Admin'',''Accounting'',''Factory'',''Shop manager''))', t);
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
