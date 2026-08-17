-- Central kitchen settings: stove / cook-type category page.

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
    'kitchen.settings',
    '爐位類別設定',
    '/kitchen/settings',
    60,
    false,
    'kitchen',
    'subpage'
  ),
  (
    'kitchen.settings.cook_types',
    '爐位類別',
    '/kitchen/settings/cook-types',
    61,
    false,
    'kitchen.settings',
    'tab'
  ),
  (
    'kitchen.settings.cook_types.delete',
    '刪除爐位類別',
    '/kitchen/settings/cook-types/actions/delete',
    62,
    true,
    'kitchen.settings.cook_types',
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
  select page_key, parent_page_key, is_high_risk, page_kind
  from public.app_pages
  where page_key in (
    'kitchen.settings',
    'kitchen.settings.cook_types',
    'kitchen.settings.cook_types.delete'
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
    when pages.page_kind = 'action' then false
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

drop policy if exists "Administrators insert cook_types" on public.cook_types;
drop policy if exists "Administrators update cook_types" on public.cook_types;
drop policy if exists "Administrators delete cook_types" on public.cook_types;

create policy "Cook type editors insert cook types"
on public.cook_types
for insert to authenticated
with check (private.has_page_access('kitchen.settings.cook_types'));

create policy "Cook type editors update cook types"
on public.cook_types
for update to authenticated
using (private.has_page_access('kitchen.settings.cook_types'))
with check (private.has_page_access('kitchen.settings.cook_types'));

create policy "Cook type editors delete cook types"
on public.cook_types
for delete to authenticated
using (private.has_page_access('kitchen.settings.cook_types.delete'));
