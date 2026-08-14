-- Split Reports into Frozen Meat and Shop third-level pages.

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
    'reports.frozen_meat',
    '凍肉',
    '/reports/frozen-meat',
    91,
    false,
    'reports',
    'subpage'
  ),
  (
    'reports.shops',
    '店鋪',
    '/reports/shops',
    98,
    false,
    'reports',
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

update public.app_pages
set
  parent_page_key = 'reports.frozen_meat',
  page_kind = 'tab',
  updated_at = now()
where page_key in (
  'reports.average_supply_price',
  'reports.production_cost_price',
  'reports.raw_meat_average_price',
  'reports.prepared_meat_stock',
  'reports.raw_meat_stock',
  'reports.supplier_purchase'
);

update public.app_pages
set
  parent_page_key = 'reports.shops',
  page_kind = 'tab',
  updated_at = now()
where page_key = 'reports.shop_order_quantities';

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
  select
    page_key,
    parent_page_key,
    is_high_risk,
    case page_key
      when 'reports.frozen_meat' then array[
        'reports.average_supply_price',
        'reports.production_cost_price',
        'reports.raw_meat_average_price',
        'reports.prepared_meat_stock',
        'reports.raw_meat_stock',
        'reports.supplier_purchase'
      ]
      when 'reports.shops' then array['reports.shop_order_quantities']
      else array[]::text[]
    end as child_keys
  from public.app_pages
  where page_key in ('reports.frozen_meat', 'reports.shops')
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
    when parent_perm.can_access then true
    when child_perm.can_access then true
    when roles.role = 'Admin' then true
    else false
  end,
  case
    when roles.role = 'Super Admin' then true
    when parent_perm.can_manage then true
    when child_perm.can_manage then true
    else false
  end
from roles
cross join new_pages pages
left join public.role_page_permissions parent_perm
  on parent_perm.role = roles.role
 and parent_perm.page_key = pages.parent_page_key
left join lateral (
  select
    bool_or(can_access) as can_access,
    bool_or(can_manage) as can_manage
  from public.role_page_permissions
  where role = roles.role
    and page_key = any (pages.child_keys)
) child_perm on true
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();
