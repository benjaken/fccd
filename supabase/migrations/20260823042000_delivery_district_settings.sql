-- Add delivery district master-data management to System Settings. This page
-- reuses public.delivery_districts so order editors and list filters see the
-- same configuration without introducing a duplicate dictionary.

insert into public.app_pages (
  page_key,
  display_name,
  route,
  sort_order,
  is_high_risk,
  parent_page_key,
  page_kind
)
values
  (
    'settings.districts',
    '地區管理',
    '/settings/districts',
    129,
    false,
    'settings',
    'subpage'
  ),
  (
    'settings.districts.edit',
    '新增／編輯／停用地區',
    '/settings/districts/actions/edit',
    130,
    true,
    'settings.districts',
    'action'
  )
on conflict (page_key) do update
set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

with roles(role) as (
  values
    ('Super Admin'),
    ('Admin'),
    ('Accounting'),
    ('Factory'),
    ('Shop manager'),
    ('Customer_Main'),
    ('Customer_Sub')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  page.page_key,
  roles.role in ('Super Admin', 'Admin'),
  roles.role in ('Super Admin', 'Admin')
from roles
cross join (
  values
    ('settings.districts'),
    ('settings.districts.edit')
) as page(page_key)
on conflict (role, page_key) do nothing;

drop policy if exists "Administrators insert delivery_districts" on public.delivery_districts;
drop policy if exists "Administrators update delivery_districts" on public.delivery_districts;
drop policy if exists "Administrators delete delivery_districts" on public.delivery_districts;

create policy "District settings editors insert delivery districts"
on public.delivery_districts
for insert
to authenticated
with check (private.has_page_access('settings.districts.edit'));

create policy "District settings editors update delivery districts"
on public.delivery_districts
for update
to authenticated
using (private.has_page_access('settings.districts.edit'))
with check (private.has_page_access('settings.districts.edit'));

create policy "District settings editors delete delivery districts"
on public.delivery_districts
for delete
to authenticated
using (private.has_page_access('settings.districts.edit'));
