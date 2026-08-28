-- A disabled parent must hide every restaurant settings child from
-- Shop manager. Earlier migrations granted a few child pages independently,
-- leaving the sidebar visible even after the parent was disabled.
with recursive descendants(page_key) as (
  select 'restaurant.settings'::text

  union all

  select child.page_key
  from public.app_pages child
  join descendants parent
    on child.parent_page_key = parent.page_key
)
update public.role_page_permissions permission
set can_access = false,
    can_manage = false,
    updated_at = now()
where permission.role = 'Shop manager'
  and permission.page_key in (select page_key from descendants)
  and (permission.can_access or permission.can_manage);
