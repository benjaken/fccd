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
      'drop policy "Administrators write %1$s" on public.%1$I',
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

drop policy "Users can read their own profile"
  on public.user_profiles;
drop policy "Administrators read all profiles"
  on public.user_profiles;

create policy "Users read own profile or administrators read all"
on public.user_profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or (
    ((select auth.jwt()) -> 'app_metadata' ->> 'role')
    in ('Super Admin', 'Admin')
  )
);
