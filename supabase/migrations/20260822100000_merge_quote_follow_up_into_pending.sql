-- The quote follow-up and pending-confirmation pages used the same open-quote
-- query. Preserve the union of their role grants, then retire the duplicate.
insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  legacy.role,
  'quotes.pending',
  legacy.can_access,
  legacy.can_manage
from public.role_page_permissions legacy
where legacy.page_key = 'quotes.follow_up'
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage;

update public.app_pages
set
  display_name = '待確認報價單',
  updated_at = now()
where page_key = 'quotes.pending';

delete from public.app_pages
where page_key = 'quotes.follow_up';
