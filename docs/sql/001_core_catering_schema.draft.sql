-- DRAFT ONLY. DO NOT APPLY WITHOUT DATA-MAPPING AND RLS APPROVAL.
-- This file is deliberately outside supabase/migrations/.

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  short_name text,
  website text,
  email text,
  sort_order integer,
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  paypal_reference text,
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.delivery_districts (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  default_fee numeric(14, 2),
  driver_team text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  display_name text,
  display_order integer,
  requires_address_check boolean,
  is_editable boolean,
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  customer_name text,
  company_name text,
  email text,
  contact_number text,
  customer_type text,
  remarks jsonb not null default '[]'::jsonb,
  bubble_created_by_legacy_id text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index customers_email_idx
  on public.customers (lower(email))
  where email is not null;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  channel_id uuid references public.channels(id),
  channel_legacy_id text,
  sku text,
  name text not null,
  chinese_name text,
  description text,
  image_url text,
  price numeric(14, 2),
  price_min numeric(14, 2),
  price_max numeric(14, 2),
  status text,
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index products_sku_idx on public.products (sku);

create index products_channel_id_idx on public.products (channel_id);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  channel_id uuid references public.channels(id),
  channel_legacy_id text,
  sku text,
  name text not null,
  chinese_name text,
  description text,
  price numeric(14, 2),
  status text,
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index packages_sku_idx on public.packages (sku);

create index packages_channel_id_idx on public.packages (channel_id);

create table public.package_products (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  package_id uuid references public.packages(id),
  package_legacy_id text,
  product_id uuid references public.products(id),
  product_legacy_id text,
  quantity numeric(14, 3),
  addon_price numeric(14, 2),
  is_selected boolean,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index package_products_package_id_idx
  on public.package_products (package_id);

create index package_products_product_id_idx
  on public.package_products (product_id);

create index package_products_pair_idx
  on public.package_products (package_id, product_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,

  customer_id uuid references public.customers(id),
  customer_legacy_id text,
  channel_id uuid references public.channels(id),
  channel_legacy_id text,

  order_number text,
  document_type text not null default 'unconfirmed'
    check (document_type in ('unconfirmed', 'quote', 'order')),
  quote_status text,
  delivery_status text,
  order_status_legacy_ids text[] not null default '{}',

  customer_name_snapshot text,
  company_name_snapshot text,
  email_snapshot text,
  contact_number_a_snapshot text,
  contact_number_b_snapshot text,
  shipping_address_snapshot text,
  customer_note_snapshot text,
  quote_description_snapshot text,
  delivery_terms_snapshot text,

  currency char(3) not null default 'HKD',
  discount_amount numeric(14, 2) not null default 0,
  shipping_fee numeric(14, 2) not null default 0,
  cashdollar_purchased numeric(14, 2) not null default 0,
  cashdollar_redeemed numeric(14, 2) not null default 0,
  grand_total numeric(14, 2),
  outstanding numeric(14, 2),

  delivery_at timestamptz,
  factory_date timestamptz,
  factory_print_date timestamptz,
  ship_out_time text,
  remarks text,
  factory_packing_note text,

  is_shopify_order boolean,
  is_quote_original boolean,
  is_sent_to_factory boolean,

  bubble_created_by_legacy_id text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index orders_order_number_idx on public.orders (order_number);

create index orders_customer_id_idx on public.orders (customer_id);
create index orders_channel_id_idx on public.orders (channel_id);
create index orders_delivery_at_idx on public.orders (delivery_at);
create index orders_document_type_idx on public.orders (document_type);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,

  order_id uuid references public.orders(id),
  order_legacy_id text,
  product_id uuid references public.products(id),
  product_legacy_id text,
  package_id uuid references public.packages(id),
  package_legacy_id text,

  sku_snapshot text,
  product_name_snapshot text,
  content_snapshot text,
  quantity numeric(14, 3),
  new_quantity_text text,
  unit_price numeric(14, 2),
  total_price numeric(14, 2),
  item_order numeric(14, 3),
  type_sort integer,
  remarks_1 text,
  remarks_2 text,
  delivery_at timestamptz,
  is_addon boolean not null default false,
  is_void boolean not null default false,
  is_printed boolean not null default false,
  is_sent_to_factory boolean not null default false,

  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_lines_order_id_idx on public.order_lines (order_id);
create index order_lines_product_id_idx on public.order_lines (product_id);
create index order_lines_package_id_idx on public.order_lines (package_id);
create index order_lines_delivery_at_idx on public.order_lines (delivery_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,

  order_id uuid references public.orders(id),
  order_legacy_id text,
  channel_id uuid references public.channels(id),
  channel_legacy_id text,
  payment_method_id uuid references public.payment_methods(id),
  payment_method_legacy_id text,

  order_number_snapshot text,
  currency char(3) not null default 'HKD',
  amount numeric(14, 2) not null,
  payment_at timestamptz,
  payout_at timestamptz,
  paypal_reference text,
  receipt_reference text,

  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz
);

create index payments_order_id_idx on public.payments (order_id);
create index payments_channel_id_idx on public.payments (channel_id);
create index payments_payment_method_id_idx
  on public.payments (payment_method_id);
create index payments_payment_at_idx on public.payments (payment_at);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,

  order_id uuid references public.orders(id),
  order_legacy_id text,
  district_id uuid references public.delivery_districts(id),
  district_legacy_id text,
  shipping_method_id uuid references public.shipping_methods(id),
  shipping_method_legacy_id text,
  motorcade_id uuid,
  motorcade_legacy_id text,
  subdriver_id uuid,
  subdriver_legacy_id text,

  delivery_at timestamptz,
  fulfilled_at timestamptz,
  taken_at timestamptz,
  ship_out_time text,
  driver_confirmation_status text,
  delivery_status text,
  basic_fee numeric(14, 2),
  total_fee numeric(14, 2),
  image_references text[] not null default '{}',

  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deliveries_order_id_idx on public.deliveries (order_id);
create index deliveries_district_id_idx on public.deliveries (district_id);
create index deliveries_shipping_method_id_idx
  on public.deliveries (shipping_method_id);
create index deliveries_delivery_at_idx on public.deliveries (delivery_at);

-- Exposed tables are denied by default until tenant and role scopes are approved.
alter table public.channels enable row level security;
alter table public.payment_methods enable row level security;
alter table public.delivery_districts enable row level security;
alter table public.shipping_methods enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.packages enable row level security;
alter table public.package_products enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.payments enable row level security;
alter table public.deliveries enable row level security;

-- No policies are intentionally defined in this draft.
-- No NOT NULL constraints are applied to resolved UUID foreign keys yet.
-- Resolve and reconcile legacy references before tightening constraints.

