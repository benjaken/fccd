-- Supplier records page under Central kitchen (乾貨與庫存 area).
-- The page is gated by kitchen.suppliers; the 查看詳細 action button is
-- gated by the kitchen.suppliers.view_detail action permission so both can
-- be managed from System Settings role permissions.

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
    'kitchen.suppliers',
    '供應商記錄',
    '/kitchen/suppliers',
    63,
    false,
    'kitchen',
    'subpage'
  ),
  (
    'kitchen.suppliers.view_detail',
    '查看供應商詳細',
    '/kitchen/suppliers/actions/view-detail',
    64,
    false,
    'kitchen.suppliers',
    'action'
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
  where page_key in ('kitchen.suppliers', 'kitchen.suppliers.view_detail')
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
    when roles.role in ('Admin', 'Factory') then true
    when parent_perm.can_access is not null then parent_perm.can_access
    else false
  end,
  case
    when roles.role = 'Super Admin' then true
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

-- The legacy supplier SELECT policy only covers finance/admin roles. Any role
-- granted the kitchen.suppliers page (e.g. Factory) must be able to read the
-- supplier records list, so gate SELECT on the page permission as well.
drop policy if exists "Supplier records readers read suppliers"
  on public.suppliers;

create policy "Supplier records readers read suppliers"
on public.suppliers
for select
to authenticated
using (private.has_page_access('kitchen.suppliers'));
