create index role_page_permissions_page_key_idx
  on public.role_page_permissions (page_key);

create index role_page_permissions_updated_by_idx
  on public.role_page_permissions (updated_by)
  where updated_by is not null;

drop policy if exists "Super Admin manages page definitions"
  on public.app_pages;

create policy "Super Admin inserts page definitions"
on public.app_pages
for insert
to authenticated
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

create policy "Super Admin updates page definitions"
on public.app_pages
for update
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
)
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

create policy "Super Admin deletes page definitions"
on public.app_pages
for delete
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

drop policy if exists "Super Admin manages role permissions"
  on public.role_page_permissions;

create policy "Super Admin inserts role permissions"
on public.role_page_permissions
for insert
to authenticated
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

create policy "Super Admin updates role permissions"
on public.role_page_permissions
for update
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
)
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

create policy "Super Admin deletes role permissions"
on public.role_page_permissions
for delete
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);
