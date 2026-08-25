-- Bring the top workspace switcher under the same role/page permission model.
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
  ('workspace', '工作區', '/factory', 5, false, null, 'page'),
  ('workspace.factory', '工場版面', '/factory', 6, false, 'workspace', 'subpage'),
  ('workspace.delivery', '司機送貨', '/driver-delivery', 7, false, 'workspace', 'subpage'),
  ('workspace.customer', '客戶自助', '/customer', 8, false, 'workspace', 'subpage')
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
),
workspace_pages(page_key) as (
  values
    ('workspace'),
    ('workspace.factory'),
    ('workspace.delivery'),
    ('workspace.customer')
)
insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  roles.role,
  workspace_pages.page_key,
  case
    when roles.role = 'Super Admin' then true
    when workspace_pages.page_key = 'workspace.customer' then false
    else true
  end,
  roles.role = 'Super Admin'
from roles
cross join workspace_pages
on conflict (role, page_key) do nothing;
