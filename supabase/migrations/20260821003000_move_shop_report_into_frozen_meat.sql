-- Move the shop order quantity report into the Frozen Meat report group.

insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  role,
  'reports.frozen_meat',
  can_access,
  can_manage
from public.role_page_permissions
where page_key = 'reports.shops'
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  role,
  'reports.shop_order_quantities',
  can_access,
  can_manage
from public.role_page_permissions
where page_key = 'reports.shops'
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

update public.app_pages
set
  parent_page_key = 'reports.frozen_meat',
  sort_order = 91,
  updated_at = now()
where page_key = 'reports.shop_order_quantities';

delete from public.role_page_permissions
where page_key = 'reports.shops';

delete from public.app_pages
where page_key = 'reports.shops';
