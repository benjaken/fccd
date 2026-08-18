-- Supplier records edit/delete action permissions under Central kitchen.
-- These gate the 編輯/刪除 buttons in the supplier list and are managed
-- from System Settings role permissions alongside view_detail.

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
    'kitchen.suppliers.edit',
    '編輯供應商',
    '/kitchen/suppliers/actions/edit',
    65,
    true,
    'kitchen.suppliers',
    'action'
  ),
  (
    'kitchen.suppliers.delete',
    '刪除供應商',
    '/kitchen/suppliers/actions/delete',
    66,
    true,
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
  where page_key in ('kitchen.suppliers.edit', 'kitchen.suppliers.delete')
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

-- The legacy supplier UPDATE/DELETE policies only cover Super Admin/Admin.
-- Any role granted the edit/delete action (e.g. Factory) must be able to
-- perform those operations, so gate them on the action permissions.
drop policy if exists "Supplier editors update suppliers"
  on public.suppliers;

create policy "Supplier editors update suppliers"
on public.suppliers
for update
to authenticated
using (private.has_page_access('kitchen.suppliers.edit'))
with check (private.has_page_access('kitchen.suppliers.edit'));

drop policy if exists "Supplier editors delete suppliers"
  on public.suppliers;

create policy "Supplier editors delete suppliers"
on public.suppliers
for delete
to authenticated
using (private.has_page_access('kitchen.suppliers.delete'));
