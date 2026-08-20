-- Report child page for tracking recurring operating-data input.

insert into public.app_pages (
  page_key,
  display_name,
  route,
  sort_order,
  is_high_risk,
  parent_page_key,
  page_kind
)
values (
  'reports.data_input_progress',
  '資料輸入進度',
  '/reports/data-input-progress',
  90,
  false,
  'reports',
  'subpage'
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
  'reports.data_input_progress',
  case
    when roles.role = 'Super Admin' then true
    else coalesce(parent_permission.can_access, false)
  end,
  case
    when roles.role = 'Super Admin' then true
    else coalesce(parent_permission.can_manage, false)
  end
from roles
left join public.role_page_permissions parent_permission
  on parent_permission.role = roles.role
 and parent_permission.page_key = 'reports'
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();
