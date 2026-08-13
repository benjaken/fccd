-- Granular user-management action permissions under settings.users.

alter table public.app_pages
  drop constraint if exists app_pages_page_kind_check;

alter table public.app_pages
  add constraint app_pages_page_kind_check
  check (page_kind in ('page', 'subpage', 'tab', 'action'));

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
    'settings.users.create',
    '新建使用者',
    '/settings/users/actions/create',
    111,
    true,
    'settings.users',
    'action'
  ),
  (
    'settings.users.edit',
    '編輯使用者',
    '/settings/users/actions/edit',
    112,
    true,
    'settings.users',
    'action'
  ),
  (
    'settings.users.change_password',
    '修改密碼',
    '/settings/users/actions/change-password',
    113,
    true,
    'settings.users',
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
insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  roles.role,
  pages.page_key,
  roles.role = 'Super Admin',
  roles.role = 'Super Admin'
from roles
cross join (
  values
    ('settings.users.create'),
    ('settings.users.edit'),
    ('settings.users.change_password')
) as pages(page_key)
on conflict (role, page_key) do nothing;
