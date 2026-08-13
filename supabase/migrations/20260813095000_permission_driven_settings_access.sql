-- Permission-driven settings access: stop hard-forcing settings.* off for every
-- non-Super-Admin role. Only migration remains reserved. Helpers let RLS and
-- edge functions check role_page_permissions instead of hardcoding roles.

create or replace function private.jwt_app_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '');
$$;

create or replace function private.has_page_access(target_page_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.jwt_app_role() = 'Super Admin'
    or exists (
      select 1
      from public.role_page_permissions permissions
      where permissions.role = private.jwt_app_role()
        and permissions.page_key = target_page_key
        and permissions.can_access
    );
$$;

create or replace function private.has_page_manage(target_page_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.jwt_app_role() = 'Super Admin'
    or exists (
      select 1
      from public.role_page_permissions permissions
      where permissions.role = private.jwt_app_role()
        and permissions.page_key = target_page_key
        and permissions.can_manage
    );
$$;

revoke all on function private.jwt_app_role() from public, anon, authenticated;
revoke all on function private.has_page_access(text) from public, anon, authenticated;
revoke all on function private.has_page_manage(text) from public, anon, authenticated;
grant execute on function private.has_page_access(text) to authenticated;
grant execute on function private.has_page_manage(text) to authenticated;

create or replace function private.enforce_reserved_page_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'Super Admin' then
    new.can_access := true;
    new.can_manage := true;
  elsif new.page_key = 'migration' then
    -- Migration tooling remains Super Admin exclusive.
    new.can_access := false;
    new.can_manage := false;
  end if;

  if not new.can_access then
    new.can_manage := false;
  end if;

  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

-- role_page_permissions management by settings.roles manage grant
drop policy if exists "Super Admin inserts role permissions"
  on public.role_page_permissions;
drop policy if exists "Super Admin updates role permissions"
  on public.role_page_permissions;
drop policy if exists "Super Admin deletes role permissions"
  on public.role_page_permissions;
drop policy if exists "Super Admin manages role permissions"
  on public.role_page_permissions;

create policy "Managers insert role permissions"
on public.role_page_permissions
for insert
to authenticated
with check (private.has_page_manage('settings.roles'));

create policy "Managers update role permissions"
on public.role_page_permissions
for update
to authenticated
using (private.has_page_manage('settings.roles'))
with check (private.has_page_manage('settings.roles'));

create policy "Managers delete role permissions"
on public.role_page_permissions
for delete
to authenticated
using (private.has_page_manage('settings.roles'));

-- Users directory readable with settings.users access
drop policy if exists "Users read own profile or Super Admin reads all"
  on public.user_profiles;
drop policy if exists "Users read own profile or administrators read all"
  on public.user_profiles;

create policy "Users read own profile or user managers read all"
on public.user_profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or private.has_page_access('settings.users')
);

-- Login logs / attachments follow their settings page grants
drop policy if exists "Super Admin reads login logs"
  on public.login_logs;

create policy "Login log readers can select"
on public.login_logs
for select
to authenticated
using (private.has_page_access('settings.login_logs'));

drop policy if exists "Super Admin reads attachment registry"
  on public.attachments;

create policy "Attachment readers can select"
on public.attachments
for select
to authenticated
using (private.has_page_access('settings.attachments'));

drop policy if exists "Super Admin reads private attachment objects"
  on storage.objects;

create policy "Attachment readers read private objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'attachments'
  and private.has_page_access('settings.attachments')
);
