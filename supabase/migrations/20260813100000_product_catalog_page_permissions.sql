-- Product catalog sub-pages for catering / lunch box / a-la-carte / packages.

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
  ('products.catering', '到會食物', '/products/catering', 41, false, 'products', 'subpage'),
  ('products.lunchbox', '飯盒列表', '/products/lunchbox', 42, false, 'products', 'subpage'),
  ('products.ala_carte', '單點食物', '/products/ala-carte', 43, false, 'products', 'subpage'),
  ('products.packages', '套餐列表', '/products/packages', 44, false, 'products', 'subpage')
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
new_pages as (
  select page_key, parent_page_key, is_high_risk
  from public.app_pages
  where page_key in (
    'products.catering',
    'products.lunchbox',
    'products.ala_carte',
    'products.packages'
  )
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
  case
    when roles.role = 'Super Admin' then true
    when parent_perm.can_access is not null then parent_perm.can_access
    when roles.role = 'Admin' then true
    else false
  end,
  case
    when roles.role = 'Super Admin' then true
    when parent_perm.can_manage is not null then parent_perm.can_manage
    else false
  end
from roles
cross join new_pages pages
left join public.role_page_permissions parent_perm
  on parent_perm.role = roles.role
 and parent_perm.page_key = pages.parent_page_key
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();
