-- Keep the existing report URL, but group Data Input Progress under Finance
-- Reconciliation in navigation and permission management.

update public.app_pages
set
  parent_page_key = 'finance',
  sort_order = 1,
  updated_at = now()
where page_key = 'reports.data_input_progress';

-- Expense Input remains a Central Kitchen page functionally, but is grouped
-- under Finance Reconciliation in the navigation/settings hierarchy. Its
-- existing direct role permissions remain unchanged.
update public.app_pages
set
  parent_page_key = 'finance',
  route = '/finance/cost-input',
  sort_order = 2,
  updated_at = now()
where page_key = 'kitchen.cost_input';

insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  parent_permission.role,
  'reports.data_input_progress',
  parent_permission.can_access,
  parent_permission.can_manage
from public.role_page_permissions parent_permission
where parent_permission.page_key = 'finance'
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();
