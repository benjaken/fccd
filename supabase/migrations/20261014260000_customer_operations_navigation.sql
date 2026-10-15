-- Promote the customer portal operations pages into their own top-level
-- section (客戶營運). Existing capability keys and bookmarked URLs are kept;
-- only their permission parent moves from 推廣設定 to 客戶營運.
insert into public.app_pages
  (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values ('customer_operations', '客戶營運', '/settings/customer-portal', 121, false, null, 'page')
on conflict (page_key) do update set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

update public.app_pages
set parent_page_key = 'customer_operations', updated_at = now()
where page_key in (
  'settings.customer_portal',
  'settings.customer_portal.reward_rules'
);

-- Preserve access for any role that already held the moved pages.
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select permission.role, 'customer_operations',
  bool_or(permission.can_access), bool_or(permission.can_manage)
from public.role_page_permissions permission
where permission.page_key in (
  'settings.customer_portal',
  'settings.customer_portal.reward_rules'
)
group by permission.role
on conflict (role, page_key) do nothing;

-- Super Admin / Admin keep the whole subtree.
with recursive customer_operations_pages as (
  select page_key from public.app_pages where page_key = 'customer_operations'
  union all
  select page.page_key from public.app_pages page
  join customer_operations_pages parent on page.parent_page_key = parent.page_key
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, page.page_key, true, true
from (values ('Super Admin'), ('Admin')) roles(role)
cross join customer_operations_pages page
on conflict (role, page_key) do update set
  can_access = true, can_manage = true, updated_at = now();
