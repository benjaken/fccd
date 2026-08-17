-- Extra order queues in the Orders sidebar: 月結, 拆單, 廚房備註,
-- 改期未審, and Shopify待審. 未付款 already exists as orders.unpaid.

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
  (
    'orders.monthly',
    '月結',
    '/orders/monthly',
    37,
    false,
    'orders',
    'subpage'
  ),
  (
    'orders.split',
    '拆單',
    '/orders/split',
    38,
    false,
    'orders',
    'subpage'
  ),
  (
    'orders.kitchen_notes',
    '廚房備註',
    '/orders/kitchen-notes',
    39,
    false,
    'orders',
    'subpage'
  ),
  (
    'orders.reschedule_pending',
    '改期未審',
    '/orders/reschedule-pending',
    40,
    false,
    'orders',
    'subpage'
  ),
  (
    'orders.shopify_pending',
    'Shopify待審',
    '/orders/shopify-pending',
    41,
    false,
    'orders',
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
),
new_pages as (
  select page_key, parent_page_key
  from public.app_pages
  where page_key in (
    'orders.monthly',
    'orders.split',
    'orders.kitchen_notes',
    'orders.reschedule_pending',
    'orders.shopify_pending'
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
    when roles.role = 'Admin' then true
    when parent_perm.can_access is not null then parent_perm.can_access
    else false
  end,
  case
    when roles.role in ('Super Admin', 'Admin') then true
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
