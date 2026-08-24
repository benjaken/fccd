-- The orders dashboard now replaces the older home follow-up summary.
-- Preserve the union of both page grants, then retire the old order-menu page.
insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  legacy.role,
  'overview.follow_up',
  legacy.can_access,
  legacy.can_manage
from public.role_page_permissions legacy
where legacy.page_key = 'orders.dashboard'
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage;

update public.app_pages
set
  display_name = '跟進',
  route = '/follow-up',
  parent_page_key = 'overview',
  page_kind = 'subpage',
  updated_at = now()
where page_key = 'overview.follow_up';

delete from public.app_pages
where page_key = 'orders.dashboard';
