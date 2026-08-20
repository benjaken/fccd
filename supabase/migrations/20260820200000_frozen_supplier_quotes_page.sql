-- First-wave supplier quote analysis page. The quote document/line tables are
-- intentionally introduced in a later migration after the parser/storage
-- runtime is selected; this page currently uses a safe reviewable MVP.

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
  'frozen.supplier_quotes',
  '供應商報價',
  '/frozen/supplier-quotes',
  54,
  false,
  'frozen',
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
  'frozen.supplier_quotes',
  roles.role in ('Super Admin', 'Admin', 'Factory', 'Accounting'),
  roles.role in ('Super Admin', 'Admin')
from roles
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();
