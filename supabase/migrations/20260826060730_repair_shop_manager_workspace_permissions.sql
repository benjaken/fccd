-- Repair workspace grants left behind when a Shop manager container was
-- disabled. Otherwise the top workspace links can remain visible with no
-- authorized child route.
with recursive disabled_roots(page_key) as (
  select permission.page_key
  from public.role_page_permissions permission
  where permission.role = 'Shop manager'
    and permission.page_key in (
      'workspace',
      'workspace.factory',
      'workspace.delivery',
      'workspace.customer'
    )
    and not permission.can_access
),
disabled_pages(page_key) as (
  select page_key
  from disabled_roots

  union all

  select child.page_key
  from public.app_pages child
  join disabled_pages parent
    on child.parent_page_key = parent.page_key
)
update public.role_page_permissions permission
set can_access = false,
    can_manage = false,
    updated_at = now()
where permission.role = 'Shop manager'
  and permission.page_key in (select page_key from disabled_pages)
  and (permission.can_access or permission.can_manage);

-- Shop manager is not a driver-delivery role. Remove the parent and every
-- delivery child so the top workspace link and direct routes are both closed.
with recursive delivery_pages(page_key) as (
  select 'workspace.delivery'::text

  union all

  select child.page_key
  from public.app_pages child
  join delivery_pages parent
    on child.parent_page_key = parent.page_key
)
update public.role_page_permissions permission
set can_access = false,
    can_manage = false,
    updated_at = now()
where permission.role = 'Shop manager'
  and permission.page_key in (select page_key from delivery_pages)
  and (permission.can_access or permission.can_manage);
