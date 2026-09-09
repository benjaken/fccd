-- Surface outbound/inbound warehouse records under Central Kitchen while
-- preserving the existing capability keys used by RPC and RLS policies.

update public.app_pages
set
  display_name = '庫存記錄',
  route = '/kitchen/inventory-records',
  sort_order = 32,
  parent_page_key = 'kitchen',
  updated_at = now()
where page_key = 'workspace.factory.warehouse';

update public.app_pages
set
  route = case page_key
    when 'workspace.factory.warehouse.pending' then '/kitchen/inventory-records'
    when 'workspace.factory.warehouse.outbound' then '/kitchen/inventory-records'
    when 'workspace.factory.warehouse.inbound' then '/kitchen/inventory-records/receipts'
  end,
  sort_order = case page_key
    when 'workspace.factory.warehouse.pending' then 33
    when 'workspace.factory.warehouse.outbound' then 34
    when 'workspace.factory.warehouse.inbound' then 35
  end,
  updated_at = now()
where page_key in (
  'workspace.factory.warehouse.pending',
  'workspace.factory.warehouse.outbound',
  'workspace.factory.warehouse.inbound'
);

insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select permission.role, 'kitchen', true, permission.can_manage
from public.role_page_permissions as permission
where permission.page_key = 'workspace.factory.warehouse'
  and permission.can_access is true
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();
