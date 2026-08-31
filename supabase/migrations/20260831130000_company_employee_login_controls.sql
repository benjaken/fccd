-- Employee managers need the linked account's login state without direct
-- access to the complete user profile directory.
create or replace function public.company_employee_login_status(
  requested_employee_ids uuid[]
)
returns table (employee_id uuid, login_enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select employee.id, profile.login_enabled
  from public.company_employees employee
  join public.user_profiles profile on profile.id = employee.linked_user_id
  where employee.id = any(requested_employee_ids)
    and private.has_page_access('settings.employees');
$$;

revoke all on function public.company_employee_login_status(uuid[])
  from public, anon, authenticated;
grant execute on function public.company_employee_login_status(uuid[])
  to authenticated;

comment on function public.company_employee_login_status(uuid[]) is
  'Returns login state for requested employees to authorized employee-list readers.';
