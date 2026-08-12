alter table public.package_products
  add column package_choice_set_legacy_id text;

create index package_products_choice_set_legacy_id_idx
  on public.package_products (package_choice_set_legacy_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'channels',
    'payment_methods',
    'delivery_districts',
    'shipping_methods',
    'order_statuses',
    'order_tags',
    'restaurants',
    'restaurant_departments',
    'products',
    'packages',
    'package_products'
  ]
  loop
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated',
      table_name
    );
    execute format(
      'create policy "Authenticated read %1$s" on public.%1$I
       for select to authenticated using (true)',
      table_name
    );
    execute format(
      'create policy "Administrators write %1$s" on public.%1$I
       for all to authenticated
       using (
         (select auth.jwt() -> ''app_metadata'' ->> ''role'')
         in (''Super Admin'', ''Admin'')
       )
       with check (
         (select auth.jwt() -> ''app_metadata'' ->> ''role'')
         in (''Super Admin'', ''Admin'')
       )',
      table_name
    );
  end loop;
end;
$$;

grant select, insert, update, delete
  on public.suppliers, public.customers
  to authenticated;

create policy "Finance and administrators read suppliers"
on public.suppliers
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting')
);

create policy "Administrators write suppliers"
on public.suppliers
for all
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
);

create policy "Finance and administrators read customers"
on public.customers
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting')
);

create policy "Administrators write customers"
on public.customers
for all
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
);

grant select, insert, update, delete
  on public.orders, public.order_lines, public.payments, public.deliveries
  to authenticated;

create policy "Operations read orders"
on public.orders
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting', 'Factory')
);

create policy "Operations read order lines"
on public.order_lines
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting', 'Factory')
);

create policy "Operations read deliveries"
on public.deliveries
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting', 'Factory')
);

create policy "Finance reads payments"
on public.payments
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting')
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'orders',
    'order_lines',
    'payments',
    'deliveries'
  ]
  loop
    execute format(
      'create policy "Administrators write %1$s" on public.%1$I
       for all to authenticated
       using (
         (select auth.jwt() -> ''app_metadata'' ->> ''role'')
         in (''Super Admin'', ''Admin'')
       )
       with check (
         (select auth.jwt() -> ''app_metadata'' ->> ''role'')
         in (''Super Admin'', ''Admin'')
       )',
      table_name
    );
  end loop;
end;
$$;

create policy "Administrators read all profiles"
on public.user_profiles
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
);
