-- Move Sale Partner under Orders > Settings and keep Bubble lookup rows visible.

alter table public.sales_partners
  add column if not exists archived_at timestamptz;

create index if not exists sales_partners_archived_at_idx
  on public.sales_partners (archived_at);

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
    'orders.settings.sale_partners',
    'Sale Partner',
    '/orders/settings/sale-partners',
    33,
    false,
    'orders.settings',
    'subpage'
  ),
  (
    'orders.settings.sale_partners.create',
    '新建 Sale Partner',
    '/orders/settings/sale-partners/actions/create',
    34,
    true,
    'orders.settings.sale_partners',
    'action'
  ),
  (
    'orders.settings.sale_partners.edit',
    '編輯 Sale Partner',
    '/orders/settings/sale-partners/actions/edit',
    35,
    true,
    'orders.settings.sale_partners',
    'action'
  ),
  (
    'orders.settings.sale_partners.delete',
    '刪除 Sale Partner',
    '/orders/settings/sale-partners/actions/delete',
    36,
    true,
    'orders.settings.sale_partners',
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

-- Drop the previous Central Kitchen placement if that migration already ran.
delete from public.role_page_permissions
where page_key in (
  'kitchen.settings.sale_partners',
  'kitchen.settings.sale_partners.create',
  'kitchen.settings.sale_partners.edit',
  'kitchen.settings.sale_partners.delete',
  'kitchen.settings'
);

delete from public.app_pages
where page_key in (
  'kitchen.settings.sale_partners.create',
  'kitchen.settings.sale_partners.edit',
  'kitchen.settings.sale_partners.delete',
  'kitchen.settings.sale_partners',
  'kitchen.settings'
);

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
  'orders.settings.sale_partners',
  case
    when roles.role = 'Super Admin' then true
    when parent_perm.can_access is not null then parent_perm.can_access
    when roles.role = 'Admin' then true
    else false
  end,
  case
    when roles.role = 'Super Admin' then true
    else false
  end
from roles
left join public.role_page_permissions parent_perm
  on parent_perm.role = roles.role
 and parent_perm.page_key = 'orders.settings'
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
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
  pages.page_key,
  roles.role in ('Super Admin', 'Admin'),
  roles.role = 'Super Admin'
from roles
cross join (
  values
    ('orders.settings.sale_partners.create'),
    ('orders.settings.sale_partners.edit'),
    ('orders.settings.sale_partners.delete')
) as pages(page_key)
on conflict (role, page_key) do nothing;

drop policy if exists "Administrators insert sales_partners" on public.sales_partners;
drop policy if exists "Sale partner creators insert sales partners" on public.sales_partners;
create policy "Sale partner creators insert sales partners"
on public.sales_partners
for insert to authenticated
with check (private.has_page_access('orders.settings.sale_partners.create'));

drop policy if exists "Administrators update sales_partners" on public.sales_partners;
drop policy if exists "Sale partner editors update sales partners" on public.sales_partners;
create policy "Sale partner editors update sales partners"
on public.sales_partners
for update to authenticated
using (private.has_page_access('orders.settings.sale_partners.edit'))
with check (private.has_page_access('orders.settings.sale_partners.edit'));

drop policy if exists "Sale partner readers select sales partners" on public.sales_partners;
create policy "Sale partner readers select sales partners"
on public.sales_partners
for select to authenticated
using (private.has_page_access('orders.settings.sale_partners'));

create or replace function public.archive_sales_partner(p_partner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_page_access('orders.settings.sale_partners.delete') then
    raise exception 'not authorized to delete sale partners'
      using errcode = '42501';
  end if;

  update public.sales_partners
  set
    archived_at = coalesce(archived_at, now()),
    bubble_modified_at = now()
  where id = p_partner_id
    and archived_at is null;

  if not found then
    raise exception 'sale partner not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.archive_sales_partner(uuid) from public, anon;
grant execute on function public.archive_sales_partner(uuid) to authenticated;

comment on function public.archive_sales_partner(uuid) is
  'Archives a sales_partners row so it disappears from the Sale Partner list.';
