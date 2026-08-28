-- Persist one permission-tree cascade as a single statement. This prevents
-- concurrent per-row requests from completing out of order or leaving a
-- partially saved hierarchy.

create or replace function public.update_role_page_permissions_batch(
  p_role text,
  p_updates jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_updates) is distinct from 'array' then
    raise exception 'invalid_permission_updates';
  end if;

  update public.role_page_permissions as permission
  set
    can_access = input.can_access,
    can_manage = input.can_access and input.can_manage
  from jsonb_to_recordset(p_updates) as input(
    page_key text,
    can_access boolean,
    can_manage boolean
  )
  where permission.role = p_role
    and permission.page_key = input.page_key;
end;
$$;

revoke all on function public.update_role_page_permissions_batch(text, jsonb)
  from public, anon;
grant execute on function public.update_role_page_permissions_batch(text, jsonb)
  to authenticated;

comment on function public.update_role_page_permissions_batch(text, jsonb) is
  'Atomically persists a precomputed role permission hierarchy cascade; table RLS remains authoritative.';
