-- Keep capability keys and bookmarked URLs while moving their permission parent.
insert into public.app_pages
  (page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind)
values ('promotion', '推廣設定', '/promotion', 119, false, null, 'page')
on conflict (page_key) do update set
  display_name = excluded.display_name, route = excluded.route, updated_at = now();

update public.app_pages
set parent_page_key = 'promotion', updated_at = now()
where page_key in (
  'settings.wati_email_logs', 'settings.customer_faq', 'settings.dictionaries',
  'settings.notifications', 'settings.districts', 'settings.attachments'
);

-- Preserve access for any existing delegated roles when introducing the parent.
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select permission.role, 'promotion', bool_or(permission.can_access), bool_or(permission.can_manage)
from public.role_page_permissions permission
join public.app_pages page on page.page_key = permission.page_key
where page.parent_page_key = 'promotion'
group by permission.role
on conflict (role, page_key) do nothing;

with recursive promotion_pages as (
  select page_key from public.app_pages where page_key = 'promotion'
  union all
  select page.page_key from public.app_pages page
  join promotion_pages parent on page.parent_page_key = parent.page_key
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, page.page_key, true, true
from (values ('Super Admin'), ('Admin')) roles(role)
cross join promotion_pages page
on conflict (role, page_key) do update set
  can_access = true, can_manage = true, updated_at = now();
