-- Expose only the employee-link status needed by the user directory without
-- granting user managers access to the complete employee records.

create or replace function public.user_employee_link_status(
  requested_user_ids uuid[]
)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select employee.linked_user_id
  from public.company_employees employee
  where employee.linked_user_id = any(requested_user_ids)
    and private.has_page_access('settings.users');
$$;

revoke all on function public.user_employee_link_status(uuid[])
  from public, anon, authenticated;
grant execute on function public.user_employee_link_status(uuid[])
  to authenticated;

comment on function public.user_employee_link_status(uuid[]) is
  'Returns which requested FCCD users are linked to an OTC2 employee account.';

