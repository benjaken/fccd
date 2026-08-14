-- Calculation settings page + single-active apply RPC.

insert into public.app_pages (
  page_key,
  display_name,
  route,
  sort_order,
  is_high_risk,
  parent_page_key,
  page_kind
)
values
  ('frozen', '凍貨', '/frozen', 45, false, null, 'page'),
  (
    'frozen.calculation_settings',
    '計算設定',
    '/frozen/calculation-settings',
    48,
    false,
    'frozen',
    'subpage'
  )
on conflict (page_key) do update
set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

with roles(role) as (
  values
    ('Super Admin'),
    ('Admin'),
    ('Accounting'),
    ('Factory'),
    ('Shop manager'),
    ('Customer_Main'),
    ('Customer_Sub')
),
new_pages as (
  select page_key, parent_page_key, is_high_risk
  from public.app_pages
  where page_key in ('frozen', 'frozen.calculation_settings')
)
insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  roles.role,
  pages.page_key,
  case
    when roles.role = 'Super Admin' then true
    when roles.role in ('Admin', 'Factory') then true
    when parent_perm.can_access is not null then parent_perm.can_access
    else false
  end,
  case
    when roles.role = 'Super Admin' then true
    else false
  end
from roles
cross join new_pages pages
left join public.role_page_permissions parent_perm
  on parent_perm.role = roles.role
 and parent_perm.page_key = pages.parent_page_key
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();

-- Enforce at most one applied calculation setting.
create or replace function public.set_meat_calculation_setting_applied(
  p_setting_id uuid,
  p_is_applied boolean
)
returns public.meat_calculation_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role'),
    ''
  );
  target public.meat_calculation_settings;
  active_count integer;
begin
  if caller_role not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'not authorized to update calculation settings'
      using errcode = '42501';
  end if;

  select * into target
  from public.meat_calculation_settings
  where id = p_setting_id;

  if not found then
    raise exception 'calculation setting not found'
      using errcode = 'P0002';
  end if;

  if p_is_applied then
    update public.meat_calculation_settings
    set
      is_applied = false,
      updated_at = now()
    where is_applied = true
      and id <> p_setting_id;

    update public.meat_calculation_settings
    set
      is_applied = true,
      updated_at = now()
    where id = p_setting_id
    returning * into target;
  else
    if target.is_applied then
      select count(*) into active_count
      from public.meat_calculation_settings
      where is_applied = true;

      if active_count <= 1 then
        raise exception 'at least one calculation setting must stay applied'
          using errcode = 'P0001';
      end if;
    end if;

    update public.meat_calculation_settings
    set
      is_applied = false,
      updated_at = now()
    where id = p_setting_id
    returning * into target;
  end if;

  return target;
end;
$$;

revoke all on function public.set_meat_calculation_setting_applied(uuid, boolean)
  from public;
grant execute on function public.set_meat_calculation_setting_applied(uuid, boolean)
  to authenticated;

comment on function public.set_meat_calculation_setting_applied(uuid, boolean) is
  'Activates one meat_calculation_settings row (deactivating others) or deactivates a non-last active row.';
