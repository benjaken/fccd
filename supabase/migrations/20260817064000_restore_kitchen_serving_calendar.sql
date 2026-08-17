-- Restore the kitchen serving calendar as the only calendar destination.
-- Roles that could open /orders/production keep the same access on /kitchen/calendar.

insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  source.role,
  'kitchen.calendar',
  source.can_access,
  source.can_manage
from public.role_page_permissions as source
where source.page_key = 'orders.production'
  and (source.can_access or source.can_manage)
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

delete from public.role_page_permissions
where page_key = 'orders.production';

delete from public.app_pages
where page_key = 'orders.production';

update public.app_pages
set
  display_name = '出餐日曆',
  updated_at = now()
where page_key = 'kitchen.calendar';
