-- Fixed-snapshot cost, purchasing, delivery surcharge, and settlement domains.

create table public.advertising_costs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  cost_type_id uuid references public.cost_types(id),
  cost_type_legacy_id text,
  channel_id uuid references public.channels(id),
  channel_legacy_id text,
  amount numeric(14,2),
  range_start timestamptz,
  range_end timestamptz,
  sorting_key numeric(14,3),
  remarks text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index advertising_costs_cost_type_id_idx on public.advertising_costs(cost_type_id);
create index advertising_costs_channel_id_idx on public.advertising_costs(channel_id);

create table public.monthly_costs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  cost_type_id uuid references public.cost_types(id),
  cost_type_legacy_id text,
  primary_channel_id uuid references public.channels(id),
  primary_channel_legacy_id text,
  festival_id uuid references public.festivals(id),
  festival_legacy_id text,
  month_at timestamptz,
  non_peak_amount numeric(14,2),
  festival_amount numeric(14,2),
  festival_range_start timestamptz,
  festival_range_end timestamptz,
  season text,
  remarks text,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index monthly_costs_cost_type_id_idx on public.monthly_costs(cost_type_id);
create index monthly_costs_primary_channel_id_idx on public.monthly_costs(primary_channel_id);
create index monthly_costs_festival_id_idx on public.monthly_costs(festival_id);

create table public.monthly_cost_channels (
  id uuid primary key default gen_random_uuid(),
  monthly_cost_id uuid not null references public.monthly_costs(id),
  channel_id uuid references public.channels(id),
  monthly_cost_legacy_id text not null,
  channel_legacy_id text not null,
  created_at timestamptz not null default now(),
  unique(monthly_cost_id, channel_legacy_id)
);
create index monthly_cost_channels_cost_id_idx on public.monthly_cost_channels(monthly_cost_id);
create index monthly_cost_channels_channel_id_idx on public.monthly_cost_channels(channel_id);

create table public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  supplier_id uuid references public.suppliers(id),
  supplier_legacy_id text,
  purchase_type_id uuid references public.purchase_types(id),
  purchase_type_legacy_id text,
  purchased_at timestamptz,
  amount numeric(14,2),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index supplier_purchases_supplier_id_idx on public.supplier_purchases(supplier_id);
create index supplier_purchases_purchase_type_id_idx on public.supplier_purchases(purchase_type_id);

create table public.delivery_surcharges (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  delivery_id uuid references public.deliveries(id),
  delivery_legacy_id text,
  surcharge_type_id uuid references public.delivery_surcharge_types(id),
  surcharge_type_legacy_id text,
  amount numeric(14,2),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index delivery_surcharges_delivery_id_idx on public.delivery_surcharges(delivery_id);
create index delivery_surcharges_type_id_idx on public.delivery_surcharges(surcharge_type_id);

create table public.payment_settlements (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  channel_id uuid references public.channels(id),
  channel_legacy_id text,
  payment_method_id uuid references public.payment_methods(id),
  payment_method_legacy_id text,
  payout_at timestamptz,
  gross_amount numeric(14,2),
  charges numeric(14,2),
  net_amount numeric(14,2),
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now()
);
create index payment_settlements_channel_id_idx on public.payment_settlements(channel_id);
create index payment_settlements_payment_method_id_idx on public.payment_settlements(payment_method_id);

create table public.payment_settlement_payments (
  id uuid primary key default gen_random_uuid(),
  payment_settlement_id uuid not null references public.payment_settlements(id),
  payment_id uuid references public.payments(id),
  payment_settlement_legacy_id text not null,
  payment_legacy_id text not null,
  created_at timestamptz not null default now(),
  unique(payment_settlement_id, payment_legacy_id)
);
create index payment_settlement_payments_settlement_id_idx
  on public.payment_settlement_payments(payment_settlement_id);
create index payment_settlement_payments_payment_id_idx
  on public.payment_settlement_payments(payment_id);

do $$
declare t text;
begin
  foreach t in array array[
    'advertising_costs','monthly_costs','monthly_cost_channels',
    'supplier_purchases','delivery_surcharges','payment_settlements',
    'payment_settlement_payments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "Finance reads %1$s" on public.%1$I for select to authenticated
       using (((select auth.jwt())->''app_metadata''->>''role'') in
       (''Super Admin'',''Admin'',''Accounting''))', t);
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
