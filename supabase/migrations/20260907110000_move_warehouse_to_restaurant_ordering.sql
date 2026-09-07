-- Move the existing warehouse pages from the factory board into the office
-- restaurant-ordering section. Keep the existing permission keys because the
-- warehouse RPCs and RLS policies already use them as capability identifiers.

update public.app_pages
set
  display_name = '庫存記錄',
  route = '/restaurant/ordering/inventory',
  sort_order = 78,
  parent_page_key = 'restaurant.ordering',
  updated_at = now()
where page_key = 'workspace.factory.warehouse';

update public.app_pages
set
  route = case page_key
    when 'workspace.factory.warehouse.pending' then '/restaurant/ordering/inventory'
    when 'workspace.factory.warehouse.outbound' then '/restaurant/ordering/inventory/shipments'
    when 'workspace.factory.warehouse.inbound' then '/restaurant/ordering/inventory/receipts'
  end,
  sort_order = case page_key
    when 'workspace.factory.warehouse.pending' then 79
    when 'workspace.factory.warehouse.outbound' then 80
    when 'workspace.factory.warehouse.inbound' then 81
  end,
  updated_at = now()
where page_key in (
  'workspace.factory.warehouse.pending',
  'workspace.factory.warehouse.outbound',
  'workspace.factory.warehouse.inbound'
);

-- A role that previously had warehouse access also needs both new navigation
-- ancestors; this does not grant any sibling restaurant-ordering pages.
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select permission.role, parent_key.page_key, true, permission.can_manage
from public.role_page_permissions as permission
cross join (
  values ('restaurant'), ('restaurant.ordering')
) as parent_key(page_key)
where permission.page_key = 'workspace.factory.warehouse'
  and permission.can_access is true
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();
