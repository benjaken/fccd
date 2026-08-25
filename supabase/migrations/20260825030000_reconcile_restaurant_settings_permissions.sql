-- Reconcile the four restaurant settings shown in the sidebar with the
-- role/page permission registry. This is intentionally idempotent and keeps
-- any grants already configured by administrators.
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
  ('restaurant.settings.payment_methods', '餐廳付款方式設定', '/restaurant/settings/payment-methods', 84, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.payment_methods.edit', '新增/編輯餐廳付款方式', '/restaurant/settings/payment-methods/actions/edit', 85, true, 'restaurant.settings.payment_methods', 'action'),
  ('restaurant.settings.payment_methods.delete', '刪除餐廳付款方式', '/restaurant/settings/payment-methods/actions/delete', 86, true, 'restaurant.settings.payment_methods', 'action'),
  ('restaurant.settings.delivery_platforms', '餐廳外賣平台設定', '/restaurant/settings/delivery-platforms', 87, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.delivery_platforms.edit', '新增/編輯餐廳外賣平台', '/restaurant/settings/delivery-platforms/actions/edit', 88, true, 'restaurant.settings.delivery_platforms', 'action'),
  ('restaurant.settings.delivery_platforms.delete', '刪除餐廳外賣平台', '/restaurant/settings/delivery-platforms/actions/delete', 89, true, 'restaurant.settings.delivery_platforms', 'action'),
  ('restaurant.settings.holidays', '餐廳員工假期', '/restaurant/settings/holidays', 90, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.holidays.edit', '新增/編輯餐廳員工假期', '/restaurant/settings/holidays/actions/edit', 91, true, 'restaurant.settings.holidays', 'action'),
  ('restaurant.settings.holidays.delete', '刪除餐廳員工假期', '/restaurant/settings/holidays/actions/delete', 92, true, 'restaurant.settings.holidays', 'action'),
  ('restaurant.settings.roster_times', '餐廳更表時間', '/restaurant/settings/roster-times', 93, false, 'restaurant.settings', 'subpage'),
  ('restaurant.settings.roster_times.edit', '新增/編輯餐廳更表時間', '/restaurant/settings/roster-times/actions/edit', 94, true, 'restaurant.settings.roster_times', 'action'),
  ('restaurant.settings.roster_times.delete', '刪除餐廳更表時間', '/restaurant/settings/roster-times/actions/delete', 95, true, 'restaurant.settings.roster_times', 'action')
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
settings_pages(page_key) as (
  values
    ('restaurant.settings.payment_methods'),
    ('restaurant.settings.payment_methods.edit'),
    ('restaurant.settings.payment_methods.delete'),
    ('restaurant.settings.delivery_platforms'),
    ('restaurant.settings.delivery_platforms.edit'),
    ('restaurant.settings.delivery_platforms.delete'),
    ('restaurant.settings.holidays'),
    ('restaurant.settings.holidays.edit'),
    ('restaurant.settings.holidays.delete'),
    ('restaurant.settings.roster_times'),
    ('restaurant.settings.roster_times.edit'),
    ('restaurant.settings.roster_times.delete')
)
insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  roles.role,
  settings_pages.page_key,
  roles.role in ('Super Admin', 'Admin', 'Shop manager'),
  roles.role = 'Super Admin'
from roles
cross join settings_pages
on conflict (role, page_key) do nothing;
