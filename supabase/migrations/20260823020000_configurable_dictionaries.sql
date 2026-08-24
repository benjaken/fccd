-- Generic configurable dictionaries for reusable business options.

create table if not exists public.dict_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dict_items (
  id uuid primary key default gen_random_uuid(),
  dict_type_id uuid not null references public.dict_types(id) on delete restrict,
  value text not null check (length(btrim(value)) > 0),
  label text not null check (length(btrim(label)) > 0),
  label_en text,
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dict_type_id, value)
);

create index if not exists dict_types_active_sort_idx
  on public.dict_types (is_active, sort_order, name);

create index if not exists dict_items_type_active_sort_idx
  on public.dict_items (dict_type_id, is_active, sort_order, label);

comment on table public.dict_types is
  'Named groups of reusable configurable business options.';
comment on table public.dict_items is
  'Ordered values belonging to a configurable dictionary type.';
comment on column public.dict_items.value is
  'Stable value persisted by business records; labels may change independently.';
comment on column public.dict_items.metadata is
  'Optional type-specific data interpreted by the owning business module.';

alter table public.dict_types enable row level security;
alter table public.dict_items enable row level security;

revoke all on table public.dict_types from public, anon;
revoke all on table public.dict_items from public, anon;
grant select, insert, update on table public.dict_types to authenticated;
grant select, insert, update on table public.dict_items to authenticated;

drop policy if exists "Authenticated users read dictionary types"
  on public.dict_types;
create policy "Authenticated users read dictionary types"
on public.dict_types
for select to authenticated
using (true);

drop policy if exists "Dictionary editors manage dictionary types"
  on public.dict_types;
create policy "Dictionary editors manage dictionary types"
on public.dict_types
for all to authenticated
using (private.has_page_access('settings.dictionaries.edit'))
with check (private.has_page_access('settings.dictionaries.edit'));

drop policy if exists "Authenticated users read dictionary items"
  on public.dict_items;
create policy "Authenticated users read dictionary items"
on public.dict_items
for select to authenticated
using (true);

drop policy if exists "Dictionary editors manage dictionary items"
  on public.dict_items;
create policy "Dictionary editors manage dictionary items"
on public.dict_items
for all to authenticated
using (private.has_page_access('settings.dictionaries.edit'))
with check (private.has_page_access('settings.dictionaries.edit'));

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
    'settings.dictionaries',
    '字典配置',
    '/settings/dictionaries',
    128,
    false,
    'settings',
    'subpage'
  ),
  (
    'settings.dictionaries.edit',
    '編輯字典配置',
    '/settings/dictionaries/actions/edit',
    129,
    true,
    'settings.dictionaries',
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
  page.page_key,
  roles.role in ('Super Admin', 'Admin'),
  case
    when page.page_key = 'settings.dictionaries.edit'
      then roles.role = 'Super Admin'
    else roles.role in ('Super Admin', 'Admin')
  end
from roles
cross join (
  values
    ('settings.dictionaries'),
    ('settings.dictionaries.edit')
) as page(page_key)
on conflict (role, page_key) do nothing;

insert into public.dict_types (code, name, description, sort_order)
values
  ('ingredient_type', '食材類型', '食材及包裝用品的分類。', 10),
  ('restaurant_staff_department', '餐廳員工部門', '餐廳員工所屬部門。', 20),
  ('restaurant_employment_type', '餐廳僱傭類型', '餐廳員工的僱傭形式。', 30),
  ('restaurant_inventory_department', '餐廳庫存部門', '餐廳庫存項目所屬部門。', 40),
  ('restaurant_stocktake_department', '餐廳盤點部門', '建立餐廳盤點記錄時可選部門。', 50),
  ('delivery_time_slot', '送貨時段', '訂單及報價可選的送貨時段。', 60),
  ('ship_out_time_slot', '出車時間', '訂單及報價可選的出車時間。', 70),
  ('quote_term_template', '報價條款模板', '報價單可加入的條款及細則。', 80),
  ('quote_payment_template', '報價付款方式模板', '報價單可加入的付款說明。', 90),
  ('quote_additional_info', '報價額外資訊', '報價單可快速加入的額外資訊。', 100),
  ('quote_activity', '報價活動項目', '報價單可快速加入的活動項目及預設金額。', 110),
  ('quote_status', '報價狀態', '報價列表及報價編輯可選的狀態；流程識別值不應修改。', 120),
  ('restaurant_monthly_pnl_category', '每月 P&L 分類', '每月 P&L 費用項目的上層分類。', 130),
  ('kitchen_advertising_festival', '中央廚房廣告節日', '中央廚房廣告表現報告可選的節日。', 140)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

with seed(type_code, value, label, label_en, metadata, sort_order) as (
  values
    ('ingredient_type', '一般食材', '一般食材', 'General ingredient', '{}'::jsonb, 10),
    ('ingredient_type', '包裝用品', '包裝用品', 'Packaging supply', '{}'::jsonb, 20),
    ('ingredient_type', '貴重食材', '貴重食材', 'Premium ingredient', '{}'::jsonb, 30),
    ('ingredient_type', '飲品', '飲品', 'Beverage', '{}'::jsonb, 40),
    ('restaurant_staff_department', '樓面', '樓面', 'Front of house', '{}'::jsonb, 10),
    ('restaurant_staff_department', '廚房', '廚房', 'Kitchen', '{}'::jsonb, 20),
    ('restaurant_staff_department', '水吧', '水吧', 'Beverage bar', '{}'::jsonb, 30),
    ('restaurant_employment_type', '全職', '全職', 'Full-time', '{}'::jsonb, 10),
    ('restaurant_employment_type', '兼職', '兼職', 'Part-time', '{}'::jsonb, 20),
    ('restaurant_inventory_department', '廚房', '廚房', 'Kitchen', '{}'::jsonb, 10),
    ('restaurant_inventory_department', '水吧', '水吧', 'Beverage bar', '{}'::jsonb, 20),
    ('restaurant_stocktake_department', 'restaurant', '餐廳', 'Restaurant', '{}'::jsonb, 10),
    ('restaurant_stocktake_department', 'water-bar', '水吧', 'Beverage bar', '{}'::jsonb, 20),
    ('delivery_time_slot', '10:00 - 11:00', '10:00 - 11:00', null, '{}'::jsonb, 10),
    ('delivery_time_slot', '11:00 - 12:00', '11:00 - 12:00', null, '{}'::jsonb, 20),
    ('delivery_time_slot', '12:00 - 13:00', '12:00 - 13:00', null, '{}'::jsonb, 30),
    ('delivery_time_slot', '13:00 - 14:00', '13:00 - 14:00', null, '{}'::jsonb, 40),
    ('delivery_time_slot', '14:00 - 15:00', '14:00 - 15:00', null, '{}'::jsonb, 50),
    ('delivery_time_slot', '15:00 - 16:00', '15:00 - 16:00', null, '{}'::jsonb, 60),
    ('delivery_time_slot', '16:00 - 17:00', '16:00 - 17:00', null, '{}'::jsonb, 70),
    ('delivery_time_slot', '17:00 - 18:00', '17:00 - 18:00', null, '{}'::jsonb, 80),
    ('delivery_time_slot', '18:00 - 19:00', '18:00 - 19:00', null, '{}'::jsonb, 90),
    ('delivery_time_slot', '19:00 - 20:00', '19:00 - 20:00', null, '{}'::jsonb, 100),
    ('quote_term_template', 'utensils', '以上訂單附送 54 份餐具，包括即棄餐具、紙碗及一些食物夾。', null, '{}'::jsonb, 10),
    ('quote_term_template', 'validity', '此報價單有效期至 2026年10月16日，逾期無效。', null, '{}'::jsonb, 20),
    ('quote_term_template', 'payment_confirmation', '所有訂單會在收到款項後方確認預留送餐日期及時段，該時段額滿即截單。', null, '{}'::jsonb, 30),
    ('quote_term_template', 'no_refund', '訂單一經付款後不設退款，如需更改送貨日期需在原定送餐時間24小時前通知。', null, '{}'::jsonb, 40),
    ('quote_term_template', 'delivery_slots', '送貨時段為上午 11 時至晚上 8 時，每 30 分鐘一個時段。', null, '{}'::jsonb, 50),
    ('quote_payment_template', 'bank_transfer', '銀行轉帳：匯豐銀行 HSBC：747-221000-838（戶口名稱：Food Channels Ltd.）', null, '{}'::jsonb, 10),
    ('quote_payment_template', 'cheque', '支票付款：抬頭「Food Channels Limited」，郵寄至「荃灣青山公路459-469號華力工業中心5字樓D-G室」', null, '{}'::jsonb, 20),
    ('quote_payment_template', 'fps', '轉數快：轉數快識別碼 FPS ID: 102938271（Food Channels Ltd.）', null, '{}'::jsonb, 30),
    ('quote_payment_template', 'payme', 'PayMe：可按連結 https://qr.payme.hsbc.com.hk/2/KccY4yvtnscAvVWbvdUR', null, '{}'::jsonb, 40),
    ('quote_payment_template', 'octopus', '八達通：可按連結', null, '{}'::jsonb, 50),
    ('quote_additional_info', 'utensil_each', '每個便當包括一份餐具', null, '{}'::jsonb, 10),
    ('quote_additional_info', 'minimum_three', '每款揀選的飯盒最少3盒', null, '{}'::jsonb, 20),
    ('quote_additional_info', 'more_styles', '以上只列出部份款式，我們另可提供更多選擇及客制款式', null, '{}'::jsonb, 30),
    ('quote_additional_info', 'drink_choice', '以上便當款式每盒可自選一款飲品：烏龍茶／檸檬茶／可口可樂', null, '{}'::jsonb, 40),
    ('quote_additional_info', 'drink_addon', '如需加購紙包飲品 $4／包：烏龍茶／檸檬茶／可口可樂', null, '{}'::jsonb, 50),
    ('quote_activity', 'lunch_boxes', '10月15日 120個飯盒', null, '{"amount":"5400"}'::jsonb, 10),
    ('quote_activity', 'venue_delivery', '活動場地佈置及運送', null, '{"amount":"800"}'::jsonb, 20),
    ('quote_activity', 'utensil_drink_bundle', '即棄餐具及飲品套裝', null, '{"amount":"480"}'::jsonb, 30),
    ('quote_status', 'Low Chance', 'Low Chance', null, '{"workflow":"open"}'::jsonb, 10),
    ('quote_status', 'High Chance', 'High Chance', null, '{"workflow":"open"}'::jsonb, 20),
    ('quote_status', 'Done Deal', 'Done Deal', null, '{"workflow":"converted"}'::jsonb, 30),
    ('quote_status', 'Case Closed', 'Case Closed', null, '{"workflow":"closed"}'::jsonb, 40),
    ('restaurant_monthly_pnl_category', 'Discount', 'Discount', null, '{}'::jsonb, 10),
    ('restaurant_monthly_pnl_category', '其他營運開支', '其他營運開支', null, '{}'::jsonb, 20),
    ('restaurant_monthly_pnl_category', '員工成本', '員工成本', null, '{}'::jsonb, 30),
    ('restaurant_monthly_pnl_category', '外賣平台', '外賣平台', null, '{}'::jsonb, 40),
    ('restaurant_monthly_pnl_category', '推廣費用', '推廣費用', null, '{}'::jsonb, 50),
    ('restaurant_monthly_pnl_category', '收款平台手續費', '收款平台手續費', null, '{}'::jsonb, 60),
    ('restaurant_monthly_pnl_category', '水電費', '水電費', null, '{}'::jsonb, 70),
    ('restaurant_monthly_pnl_category', '租金', '租金', null, '{}'::jsonb, 80),
    ('restaurant_monthly_pnl_category', '行政費用', '行政費用', null, '{}'::jsonb, 90),
    ('kitchen_advertising_festival', '父親節', '父親節', 'Father''s Day', '{}'::jsonb, 10),
    ('kitchen_advertising_festival', '中秋節', '中秋節', 'Mid-Autumn Festival', '{}'::jsonb, 20),
    ('kitchen_advertising_festival', '母親節', '母親節', 'Mother''s Day', '{}'::jsonb, 30),
    ('kitchen_advertising_festival', 'Xmas + 冬至', 'Xmas + 冬至', 'Christmas + Winter Solstice', '{}'::jsonb, 40),
    ('kitchen_advertising_festival', '農曆新年', '農曆新年', 'Lunar New Year', '{}'::jsonb, 50),
    ('kitchen_advertising_festival', '復活節', '復活節', 'Easter', '{}'::jsonb, 60)
)
insert into public.dict_items (
  dict_type_id,
  value,
  label,
  label_en,
  metadata,
  sort_order
)
select
  types.id,
  seed.value,
  seed.label,
  seed.label_en,
  seed.metadata,
  seed.sort_order
from seed
join public.dict_types types on types.code = seed.type_code
on conflict (dict_type_id, value) do update
set
  label = excluded.label,
  label_en = excluded.label_en,
  metadata = excluded.metadata,
  sort_order = excluded.sort_order,
  updated_at = now();

with slots as (
  select
    to_char(value, 'HH24:MI') as value,
    row_number() over (order by value)::integer * 10 as sort_order
  from generate_series(
    timestamp '2000-01-01 08:30:00',
    timestamp '2000-01-01 20:00:00',
    interval '15 minutes'
  ) value
)
insert into public.dict_items (dict_type_id, value, label, sort_order)
select types.id, slots.value, slots.value, slots.sort_order
from slots
join public.dict_types types on types.code = 'ship_out_time_slot'
on conflict (dict_type_id, value) do update
set label = excluded.label, sort_order = excluded.sort_order, updated_at = now();

-- The allowed P&L categories are now maintained by the generic dictionary.
alter table public.restaurant_monthly_pnl_cost_categories
  drop constraint if exists restaurant_monthly_pnl_cost_categories_category_check;
