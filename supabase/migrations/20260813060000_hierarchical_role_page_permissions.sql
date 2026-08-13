-- Hierarchical page permissions: parents, sub-pages, and tabs.
-- Selecting a parent grant cascades to all descendants.

alter table public.app_pages
  add column if not exists parent_page_key text
    references public.app_pages (page_key) on delete cascade,
  add column if not exists page_kind text not null default 'page';

alter table public.app_pages
  drop constraint if exists app_pages_page_kind_check;

alter table public.app_pages
  add constraint app_pages_page_kind_check
  check (page_kind in ('page', 'subpage', 'tab'));

alter table public.app_pages
  drop constraint if exists app_pages_parent_not_self;

alter table public.app_pages
  add constraint app_pages_parent_not_self
  check (parent_page_key is distinct from page_key);

-- Child routes may share a path prefix; allow duplicate routes.
alter table public.app_pages drop constraint if exists app_pages_route_key;

create index if not exists app_pages_parent_page_key_idx
  on public.app_pages (parent_page_key);

create index if not exists app_pages_page_kind_idx
  on public.app_pages (page_kind);

-- Parent section for system settings.
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
  ('settings', '系統設定', '/settings', 105, true, null, 'page')
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
  parent_page_key = 'settings',
  page_kind = 'subpage',
  updated_at = now()
where page_key in ('settings.users', 'settings.roles', 'settings.attachments');

-- Sub-pages and report tabs matching current navigation / UI.
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
  ('overview.follow_up', '跟進', '/follow-up', 11, false, 'overview', 'subpage'),

  ('orders.new', '建立新單', '/orders/new', 21, false, 'orders', 'subpage'),
  ('orders.pending', '待確定訂單', '/orders/pending', 22, false, 'orders', 'subpage'),
  ('orders.production', '出產日曆', '/orders/production', 23, false, 'orders', 'subpage'),
  ('orders.payments', '收款到賬', '/orders/payments', 24, false, 'orders', 'subpage'),
  ('orders.drivers', '安排司機', '/orders/drivers', 25, false, 'orders', 'subpage'),
  ('orders.unpaid', '未付款訂單', '/orders/unpaid', 26, true, 'orders', 'subpage'),
  ('orders.delivered_unpaid', '已送貨未付款', '/orders/delivered-unpaid', 27, true, 'orders', 'subpage'),

  ('quotes.customers', '客戶列表', '/quotes/customers', 31, false, 'quotes', 'subpage'),
  ('quotes.follow_up', '客戶意見', '/quotes/follow-up', 32, false, 'quotes', 'subpage'),

  ('kitchen.calendar', '出產日曆', '/kitchen/calendar', 51, false, 'kitchen', 'subpage'),
  ('kitchen.inventory', '廚房庫存', '/kitchen/inventory', 52, false, 'kitchen', 'subpage'),

  ('delivery.assign', '安排司機', '/delivery/assign', 61, false, 'delivery', 'subpage'),

  ('restaurant.inventory', '餐廳盤點', '/restaurant/inventory', 81, false, 'restaurant', 'subpage'),
  ('restaurant.reports', '餐廳報數', '/restaurant/reports', 82, false, 'restaurant', 'subpage'),

  (
    'reports.shop_order_quantities',
    '各店訂貨數量',
    '/reports/tabs/shop-order-quantities',
    91,
    false,
    'reports',
    'tab'
  ),
  (
    'reports.average_supply_price',
    '平均入貨價',
    '/reports/tabs/average-supply-price',
    92,
    false,
    'reports',
    'tab'
  ),
  (
    'reports.production_cost_price',
    '生產成本價',
    '/reports/tabs/production-cost-price',
    93,
    false,
    'reports',
    'tab'
  ),
  (
    'reports.raw_meat_average_price',
    '生肉平均價',
    '/reports/tabs/raw-meat-average-price',
    94,
    false,
    'reports',
    'tab'
  ),
  (
    'reports.prepared_meat_stock',
    '製成品存貨',
    '/reports/tabs/prepared-meat-stock',
    95,
    false,
    'reports',
    'tab'
  ),
  (
    'reports.raw_meat_stock',
    '生肉存貨',
    '/reports/tabs/raw-meat-stock',
    96,
    false,
    'reports',
    'tab'
  ),
  (
    'reports.supplier_purchase',
    '供應商採購',
    '/reports/tabs/supplier-purchase',
    97,
    false,
    'reports',
    'tab'
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

-- Seed role grants for new pages from their parent (or reserved defaults).
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
  where page_key = 'settings'
     or parent_page_key is not null
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
    when pages.page_key = 'settings'
      or pages.page_key like 'settings.%'
      or pages.page_key = 'migration' then false
    when parent_perm.can_access is not null then parent_perm.can_access
    when roles.role = 'Admin' then true
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
on conflict (role, page_key) do nothing;

-- Keep Super Admin + reserved-page rules; treat settings parent as reserved.
create or replace function private.enforce_reserved_page_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'Super Admin' then
    new.can_access := true;
    new.can_manage := true;
  elsif new.page_key = 'settings'
    or new.page_key like 'settings.%'
    or new.page_key = 'migration' then
    new.can_access := false;
    new.can_manage := false;
  end if;

  if not new.can_access then
    new.can_manage := false;
  end if;

  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

-- Cascade helper: return page_key plus all descendants (depth-first by sort_order).
create or replace function public.app_page_descendants(root_page_key text)
returns table (page_key text, sort_order integer, depth integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive tree as (
    select
      p.page_key,
      p.sort_order,
      0 as depth
    from public.app_pages p
    where p.page_key = root_page_key
    union all
    select
      child.page_key,
      child.sort_order,
      tree.depth + 1
    from public.app_pages child
    inner join tree on child.parent_page_key = tree.page_key
  )
  select tree.page_key, tree.sort_order, tree.depth
  from tree
  order by tree.depth, tree.sort_order, tree.page_key;
$$;

revoke all on function public.app_page_descendants(text)
  from public, anon;
grant execute on function public.app_page_descendants(text) to authenticated;

comment on column public.app_pages.parent_page_key is
  'Optional parent page_key. Selecting the parent permission in settings selects all descendants.';
comment on column public.app_pages.page_kind is
  'page = top-level section, subpage = secondary nav route, tab = in-page tab.';
