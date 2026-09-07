-- Set the initial restaurant-workspace permissions. Runtime authorization
-- remains fully permission-driven, so these values can later be changed from
-- the role-permissions settings page without a hard-coded role gate.

update public.role_page_permissions
set
  can_access = role in ('Super Admin', 'Admin', 'Shop manager'),
  can_manage = role = 'Super Admin',
  updated_at = now()
where page_key = 'workspace.restaurant'
   or page_key like 'workspace.restaurant.%';
