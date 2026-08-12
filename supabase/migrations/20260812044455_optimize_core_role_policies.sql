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
    'package_products',
    'suppliers',
    'customers',
    'orders',
    'order_lines',
    'payments',
    'deliveries'
  ]
  loop
    execute format(
      'alter policy "Administrators write %1$s" on public.%1$I
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
  end loop;
end;
$$;

alter policy "Finance and administrators read suppliers"
on public.suppliers
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting')
);

alter policy "Finance and administrators read customers"
on public.customers
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting')
);

alter policy "Operations read orders"
on public.orders
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting', 'Factory')
);

alter policy "Operations read order lines"
on public.order_lines
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting', 'Factory')
);

alter policy "Operations read deliveries"
on public.deliveries
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting', 'Factory')
);

alter policy "Finance reads payments"
on public.payments
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting')
);

alter policy "Administrators read all profiles"
on public.user_profiles
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
);
