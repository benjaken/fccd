-- 食材/包裝用品 list page under Central kitchen (乾貨與庫存 area).
-- The page is gated by kitchen.ingredients; the 新增/編輯 and 刪除 buttons are
-- gated by the corresponding .edit/.delete action permissions so both can
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
    'kitchen.ingredients',
    '食材/包裝用品',
    '/kitchen/ingredients',
    53,
    false,
    'kitchen',
    'subpage'
  ),
  (
    'kitchen.ingredients.edit',
    '新增/編輯食材/包裝用品',
    '/kitchen/ingredients/actions/edit',
    54,
    true,
    'kitchen.ingredients',
    'action'
  ),
  (
    'kitchen.ingredients.delete',
    '刪除食材/包裝用品',
    '/kitchen/ingredients/actions/delete',
    55,
    true,
    'kitchen.ingredients',
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
  where page_key in (
    'kitchen.ingredients',
    'kitchen.ingredients.edit',
    'kitchen.ingredients.delete'
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

-- The legacy ingredient SELECT policy only covers Super Admin/Admin/Factory
-- roles. Any role granted the page must be able to read the list, so gate
-- SELECT on the page permission as well.
drop policy if exists "Ingredient list readers read ingredients"
  on public.ingredients;

create policy "Ingredient list readers read ingredients"
on public.ingredients
for select
to authenticated
using (private.has_page_access('kitchen.ingredients'));

-- Write access follows the action permissions instead of hardcoding roles.
drop policy if exists "Ingredient editors insert ingredients"
  on public.ingredients;
drop policy if exists "Ingredient editors update ingredients"
  on public.ingredients;

create policy "Ingredient editors insert ingredients"
on public.ingredients
for insert
to authenticated
with check (private.has_page_access('kitchen.ingredients.edit'));

create policy "Ingredient editors update ingredients"
on public.ingredients
for update
to authenticated
using (private.has_page_access('kitchen.ingredients.edit'))
with check (private.has_page_access('kitchen.ingredients.edit'));

drop policy if exists "Ingredient editors delete ingredients"
  on public.ingredients;

create policy "Ingredient editors delete ingredients"
on public.ingredients
for delete
to authenticated
using (private.has_page_access('kitchen.ingredients.delete'));

-- Ingredients list needs supplier names; the legacy supplier SELECT policy
-- only covers finance/admin roles. Any role granted kitchen.ingredients must
-- be able to read supplier names for the linked column.
drop policy if exists "Ingredient readers read suppliers"
  on public.suppliers;

create policy "Ingredient readers read suppliers"
on public.suppliers
for select
to authenticated
using (private.has_page_access('kitchen.ingredients'));
