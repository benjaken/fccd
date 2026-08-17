-- Orders > Settings > Order Status list, with create/edit/delete
-- bound to role page permissions.

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
    'orders.settings',
    '設定',
    '/orders/settings',
    28,
    false,
    'orders',
    'subpage'
  ),
  (
    'orders.settings.statuses',
    '訂單狀態',
    '/orders/settings/statuses',
    29,
    false,
    'orders.settings',
    'subpage'
  ),
  (
    'orders.settings.statuses.create',
    '新建訂單狀態',
    '/orders/settings/statuses/actions/create',
    30,
    true,
    'orders.settings.statuses',
    'action'
  ),
  (
    'orders.settings.statuses.edit',
    '編輯訂單狀態',
    '/orders/settings/statuses/actions/edit',
    31,
    true,
    'orders.settings.statuses',
    'action'
  ),
  (
    'orders.settings.statuses.delete',
    '刪除訂單狀態',
    '/orders/settings/statuses/actions/delete',
    32,
    true,
    'orders.settings.statuses',
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
list_pages as (
  select page_key, parent_page_key
  from public.app_pages
  where page_key in ('orders.settings', 'orders.settings.statuses')
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
    else false
  end
from roles
cross join list_pages pages
left join public.role_page_permissions parent_perm
  on parent_perm.role = roles.role
 and parent_perm.page_key = pages.parent_page_key
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
    ('orders.settings.statuses.create'),
    ('orders.settings.statuses.edit'),
    ('orders.settings.statuses.delete')
) as pages(page_key)
on conflict (role, page_key) do nothing;

drop policy if exists "Administrators insert order_statuses" on public.order_statuses;
create policy "Order status creators insert order statuses"
on public.order_statuses
for insert to authenticated
with check (private.has_page_access('orders.settings.statuses.create'));

drop policy if exists "Administrators update order_statuses" on public.order_statuses;
create policy "Order status editors update order statuses"
on public.order_statuses
for update to authenticated
using (private.has_page_access('orders.settings.statuses.edit'))
with check (private.has_page_access('orders.settings.statuses.edit'));

create or replace function public.archive_order_status(p_status_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_page_access('orders.settings.statuses.delete') then
    raise exception 'not authorized to delete order statuses'
      using errcode = '42501';
  end if;

  update public.order_statuses
  set
    archived_at = coalesce(archived_at, now()),
    bubble_modified_at = now(),
    updated_at = now()
  where id = p_status_id
    and archived_at is null;

  if not found then
    raise exception 'order status not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.archive_order_status(uuid) from public, anon;
grant execute on function public.archive_order_status(uuid) to authenticated;

comment on function public.archive_order_status(uuid) is
  'Archives an order_statuses row so it disappears from the Order Status list.';
