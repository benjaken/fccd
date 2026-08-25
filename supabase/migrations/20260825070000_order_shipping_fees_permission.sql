-- Give shipping-fee maintenance its own permission so Accounting can manage
-- delivery charges without gaining management of every Orders > Settings tab.
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
  'orders.settings.shipping_fees',
  '運費管理',
  '/orders/settings/shipping-fees',
  35,
  false,
  'orders.settings',
  'subpage'
)
on conflict (page_key) do update
set display_name = excluded.display_name,
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
permissions as (
  select
    roles.role,
    coalesce(parent.can_access, false) as parent_access
  from roles
  left join public.role_page_permissions parent
    on parent.role = roles.role
   and parent.page_key = 'orders.settings'
)
insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  role,
  'orders.settings.shipping_fees',
  case
    when role in ('Super Admin', 'Admin', 'Accounting') then true
    else parent_access
  end,
  role in ('Super Admin', 'Admin', 'Accounting')
from permissions
on conflict (role, page_key) do update
set can_access = excluded.can_access,
    can_manage = excluded.can_manage,
    updated_at = now();

drop policy if exists "Order settings readers read shipping fees"
  on public.order_shipping_fees;
drop policy if exists "Order settings managers insert shipping fees"
  on public.order_shipping_fees;
drop policy if exists "Order settings managers update shipping fees"
  on public.order_shipping_fees;

create policy "Shipping fee readers read shipping fees"
on public.order_shipping_fees
for select
to authenticated
using (private.has_page_access('orders.settings.shipping_fees'));

create policy "Shipping fee managers insert shipping fees"
on public.order_shipping_fees
for insert
to authenticated
with check (private.has_page_manage('orders.settings.shipping_fees'));

create policy "Shipping fee managers update shipping fees"
on public.order_shipping_fees
for update
to authenticated
using (private.has_page_manage('orders.settings.shipping_fees'))
with check (private.has_page_manage('orders.settings.shipping_fees'));
