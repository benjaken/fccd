-- Configurable titles and explanations for order list queues.
-- Seeded lists match the Orders sidebar; edits live in 系統設定.

create table if not exists public.order_list_configs (
  id uuid primary key default gen_random_uuid(),
  preset_key text not null unique
    check (
      preset_key in (
        'all',
        'pending',
        'unpaid',
        'delivered-unpaid',
        'monthly-settlement',
        'split',
        'kitchen-notes',
        'reschedule-pending',
        'shopify-pending'
      )
    ),
  title text not null,
  description text not null default '',
  sort_order integer not null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.order_list_configs is
  'Titles and explanations shown on each order list; edited from System Settings.';

create index if not exists order_list_configs_sort_order_idx
  on public.order_list_configs (sort_order, title);

insert into public.order_list_configs (
  preset_key,
  title,
  description,
  sort_order,
  is_visible
)
values
  (
    'all',
    '所有訂單',
    '查看全部已確認到會訂單，可搜尋訂單編號、客戶，並篩選營運狀態。',
    10,
    true
  ),
  (
    'pending',
    '待確定訂單',
    '尚未轉為正式訂單的未確定紀錄，需確認後才進入生產及送貨。',
    20,
    true
  ),
  (
    'unpaid',
    '未付款訂單',
    '尚有未收金額的訂單，以未付餘額為準，方便跟進收款。',
    30,
    true
  ),
  (
    'monthly-settlement',
    '月結訂單',
    '已標示「月結」的訂單，方便跟進月結客戶對賬及收款。',
    40,
    true
  ),
  (
    'split',
    '拆單訂單',
    '已標示「已拆單」的訂單，方便跟進分拆後的子單。',
    50,
    true
  ),
  (
    'kitchen-notes',
    '廚房備註訂單',
    '已標示「廚房備註」的訂單，工場需留意特別烹調或包裝指示。',
    60,
    true
  ),
  (
    'reschedule-pending',
    '改期未審訂單',
    '送貨日期改期後尚未審核確定的訂單。',
    70,
    true
  ),
  (
    'shopify-pending',
    'Shopify待審訂單',
    '從 Shopify 新接入、尚待內部審核的訂單。',
    80,
    true
  ),
  (
    'delivered-unpaid',
    '已送貨未付款',
    '已經送達但仍有未付餘額的訂單。',
    90,
    true
  )
on conflict (preset_key) do nothing;

alter table public.order_list_configs enable row level security;

revoke all on table public.order_list_configs from public, anon;
grant select, update on table public.order_list_configs to authenticated;

drop policy if exists "Authenticated users read order list configs"
  on public.order_list_configs;
create policy "Authenticated users read order list configs"
on public.order_list_configs
for select to authenticated
using (true);

drop policy if exists "Order list config editors update configs"
  on public.order_list_configs;
create policy "Order list config editors update configs"
on public.order_list_configs
for update to authenticated
using (private.has_page_access('settings.order_lists.edit'))
with check (private.has_page_access('settings.order_lists.edit'));

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
    'settings.order_lists',
    '訂單列表',
    '/settings/order-lists',
    128,
    false,
    'settings',
    'subpage'
  ),
  (
    'settings.order_lists.edit',
    '編輯訂單列表',
    '/settings/order-lists/actions/edit',
    129,
    true,
    'settings.order_lists',
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
)
insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  roles.role,
  'settings.order_lists',
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
left join public.role_page_permissions parent_perm
  on parent_perm.role = roles.role
 and parent_perm.page_key = 'settings'
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
  'settings.order_lists.edit',
  roles.role in ('Super Admin', 'Admin'),
  roles.role = 'Super Admin'
from roles
on conflict (role, page_key) do nothing;
