-- Accounting users are operational order editors. Keep the page permission
-- aligned with the permission-driven order RLS introduced in 20260825040000.
update public.role_page_permissions
set can_access = true,
    can_manage = true,
    updated_at = now()
where role = 'Accounting'
  and page_key = 'orders';
