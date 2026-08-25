-- Split the three standalone workspaces into the same sitemap hierarchy used
-- by the application. Existing workspace grants are inherited once; future
-- changes can then be managed per page in the role permission editor.
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
  ('workspace.factory.board', '工場工作看板', '/factory', 601, false, 'workspace.factory', 'subpage'),
  ('workspace.factory.order', '工場訂單工作頁', '/factory/order/:deliveryId', 602, false, 'workspace.factory', 'subpage'),
  ('workspace.factory.meat_delivery_note', '凍肉送貨單', '/factory/meat-delivery-note/:meatOrderId', 603, false, 'workspace.factory', 'subpage'),
  ('workspace.factory.multi_day_menu', '多日菜式總表', '/factory/multi-day-menu', 604, false, 'workspace.factory', 'subpage'),
  ('workspace.factory.production_calendar', '出餐日曆', '/factory/production-calendar', 605, false, 'workspace.factory', 'subpage'),
  ('workspace.delivery.available', '可接訂單', '/driver-delivery/available', 701, false, 'workspace.delivery', 'subpage'),
  ('workspace.delivery.accepted', '已接訂單', '/driver-delivery/accepted', 702, false, 'workspace.delivery', 'subpage'),
  ('workspace.delivery.fleet', '車隊訂單', '/driver-delivery/fleet', 703, false, 'workspace.delivery', 'subpage'),
  ('workspace.delivery.income', '合共收入', '/driver-delivery/income', 704, false, 'workspace.delivery', 'subpage'),
  ('workspace.delivery.districts', '分區運費', '/driver-delivery/districts', 705, false, 'workspace.delivery', 'subpage'),
  ('workspace.delivery.settings', '車隊設定', '/driver-delivery/settings', 706, true, 'workspace.delivery', 'subpage'),
  ('workspace.customer.portal', '客戶自助入口', '/customer', 801, false, 'workspace.customer', 'subpage')
on conflict (page_key) do update
set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

with workspace_children(page_key, parent_page_key) as (
  values
    ('workspace.factory.board', 'workspace.factory'),
    ('workspace.factory.order', 'workspace.factory'),
    ('workspace.factory.meat_delivery_note', 'workspace.factory'),
    ('workspace.factory.multi_day_menu', 'workspace.factory'),
    ('workspace.factory.production_calendar', 'workspace.factory'),
    ('workspace.delivery.available', 'workspace.delivery'),
    ('workspace.delivery.accepted', 'workspace.delivery'),
    ('workspace.delivery.fleet', 'workspace.delivery'),
    ('workspace.delivery.income', 'workspace.delivery'),
    ('workspace.delivery.districts', 'workspace.delivery'),
    ('workspace.delivery.settings', 'workspace.delivery'),
    ('workspace.customer.portal', 'workspace.customer')
),
roles(role) as (
  select distinct role from public.role_page_permissions
)
insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  roles.role,
  child.page_key,
  coalesce(parent.can_access, false),
  coalesce(parent.can_manage, false)
from roles
cross join workspace_children child
left join public.role_page_permissions parent
  on parent.role = roles.role
 and parent.page_key = child.parent_page_key
on conflict (role, page_key) do nothing;
