-- Orders Dashboard submenu (訂單儀表板) plus the tables it links to:
--  - Shopify 待入單 / 待收款訂單 reuse the existing shopify-pending and unpaid
--    order queues.
--  - 未傳工場訂單 is a new order queue preset (not-sent-factory).
--  - 待報價 (pending quotes) marks EmailMeForm-synced inquiries that have not
--    been answered yet.
--  - 即將到期報價 (upcoming quotes) lists open quotes with a delivery date in
--    the next two weeks, sorted by delivery date.

-- The Shopify order sync writes source_system = 'shopify'; EmailMeForm
-- inquiries are written as source_system = 'emailmeform'. Ensure the column
-- exists idempotently for databases that predate the sync.
alter table public.orders
  add column if not exists source_system text;

create index if not exists orders_source_system_idx
  on public.orders (source_system)
  where source_system is not null;

create index if not exists orders_document_type_delivery_at_idx
  on public.orders (document_type, delivery_at);

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
    'orders.dashboard',
    '訂單儀表板',
    '/orders/dashboard',
    28,
    false,
    'orders',
    'subpage'
  ),
  (
    'orders.not_sent_factory',
    '未傳工場訂單',
    '/orders/not-sent-factory',
    29,
    false,
    'orders',
    'subpage'
  ),
  (
    'quotes.pending',
    '待報價',
    '/quotes/pending',
    33,
    false,
    'quotes',
    'subpage'
  ),
  (
    'quotes.upcoming',
    '即將到期報價',
    '/quotes/upcoming',
    34,
    false,
    'quotes',
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
    'orders.dashboard',
    'orders.not_sent_factory',
    'quotes.pending',
    'quotes.upcoming'
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
    when roles.role = 'Admin' then true
    when parent_perm.can_access is not null then parent_perm.can_access
    else false
  end,
  case
    when roles.role in ('Super Admin', 'Admin') then true
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

-- Extend the order-list-config preset allow-list and seed a row for the
-- 未傳工場訂單 queue so it can be renamed or hidden from 系統設定.
alter table public.order_list_configs
  drop constraint if exists order_list_configs_preset_key_check;

alter table public.order_list_configs
  add constraint order_list_configs_preset_key_check
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
      'shopify-pending',
      'not-sent-factory'
    )
  );

insert into public.order_list_configs (
  preset_key,
  title,
  description,
  sort_order,
  is_visible
)
values (
  'not-sent-factory',
  '未傳工場訂單',
  '已確認但尚未傳送至工場的訂單，需安排生產。',
  100,
  true
)
on conflict (preset_key) do nothing;
