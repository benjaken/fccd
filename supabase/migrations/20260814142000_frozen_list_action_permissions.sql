-- Edit/delete actions for frozen goods lists. Super Admin only for now.

update public.app_pages
set sort_order = 47, updated_at = now()
where page_key = 'frozen.seasoning_cost';

update public.app_pages
set sort_order = 50, updated_at = now()
where page_key = 'frozen.spice_usage';

update public.app_pages
set sort_order = 52, updated_at = now()
where page_key = 'frozen.calculation_settings';

update public.app_pages
set sort_order = 54, updated_at = now()
where page_key = 'frozen.meat_customers';

update public.app_pages
set sort_order = 57, updated_at = now()
where page_key = 'kitchen';

update public.app_pages
set sort_order = 58, updated_at = now()
where page_key = 'kitchen.calendar';

update public.app_pages
set sort_order = 59, updated_at = now()
where page_key = 'kitchen.inventory';

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
  (
    'frozen.seasoning_cost.edit',
    '編輯香料成本',
    '/frozen/seasoning-cost/actions/edit',
    48,
    true,
    'frozen.seasoning_cost',
    'action'
  ),
  (
    'frozen.seasoning_cost.delete',
    '刪除香料成本',
    '/frozen/seasoning-cost/actions/delete',
    49,
    true,
    'frozen.seasoning_cost',
    'action'
  ),
  (
    'frozen.spice_usage.delete',
    '刪除香料用量',
    '/frozen/spice-usage/actions/delete',
    51,
    true,
    'frozen.spice_usage',
    'action'
  ),
  (
    'frozen.calculation_settings.delete',
    '刪除計算設定',
    '/frozen/calculation-settings/actions/delete',
    53,
    true,
    'frozen.calculation_settings',
    'action'
  ),
  (
    'frozen.meat_customers.edit',
    '編輯客戶',
    '/frozen/customers/actions/edit',
    55,
    true,
    'frozen.meat_customers',
    'action'
  ),
  (
    'frozen.meat_customers.delete',
    '刪除客戶',
    '/frozen/customers/actions/delete',
    56,
    true,
    'frozen.meat_customers',
    'action'
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
  roles.role = 'Super Admin',
  roles.role = 'Super Admin'
from roles
cross join (
  values
    ('frozen.seasoning_cost.edit'),
    ('frozen.seasoning_cost.delete'),
    ('frozen.spice_usage.delete'),
    ('frozen.calculation_settings.delete'),
    ('frozen.meat_customers.edit'),
    ('frozen.meat_customers.delete')
) as pages(page_key)
on conflict (role, page_key) do nothing;

drop policy if exists "Administrators update seasonings" on public.seasonings;
create policy "Seasoning editors update seasonings"
on public.seasonings
for update to authenticated
using (private.has_page_access('frozen.seasoning_cost.edit'))
with check (private.has_page_access('frozen.seasoning_cost.edit'));

drop policy if exists "Administrators update meat_customers" on public.meat_customers;
create policy "Customer editors update meat customers"
on public.meat_customers
for update to authenticated
using (private.has_page_access('frozen.meat_customers.edit'))
with check (private.has_page_access('frozen.meat_customers.edit'));

create or replace function public.archive_seasoning(p_seasoning_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_page_access('frozen.seasoning_cost.delete') then
    raise exception 'not authorized to delete seasonings'
      using errcode = '42501';
  end if;

  update public.seasonings
  set
    archived_at = coalesce(archived_at, now()),
    updated_at = now()
  where id = p_seasoning_id;

  if not found then
    raise exception 'seasoning not found'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.archive_meat_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_page_access('frozen.meat_customers.delete') then
    raise exception 'not authorized to delete customers'
      using errcode = '42501';
  end if;

  update public.meat_customers
  set
    archived_at = coalesce(archived_at, now()),
    updated_at = now()
  where id = p_customer_id;

  if not found then
    raise exception 'customer not found'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.unapply_meat_seasoning_cost_version(
  p_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_page_access('frozen.spice_usage.delete') then
    raise exception 'not authorized to delete spice usages'
      using errcode = '42501';
  end if;

  update public.meat_seasoning_cost_versions
  set is_applied = false
  where id = p_version_id;

  if not found then
    raise exception 'seasoning usage not found'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.delete_meat_calculation_setting(
  p_setting_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
  was_applied boolean;
  fallback_id uuid;
begin
  if not private.has_page_access('frozen.calculation_settings.delete') then
    raise exception 'not authorized to delete calculation settings'
      using errcode = '42501';
  end if;

  select count(*) into remaining
  from public.meat_calculation_settings;

  if remaining <= 1 then
    raise exception 'at least one calculation setting must remain'
      using errcode = 'P0001';
  end if;

  select is_applied into was_applied
  from public.meat_calculation_settings
  where id = p_setting_id;

  if not found then
    raise exception 'calculation setting not found'
      using errcode = 'P0002';
  end if;

  if was_applied then
    select id into fallback_id
    from public.meat_calculation_settings
    where id <> p_setting_id
    order by coalesce(bubble_created_at, created_at) desc, created_at desc
    limit 1;

    if fallback_id is not null then
      update public.meat_calculation_settings
      set
        is_applied = true,
        updated_at = now()
      where id = fallback_id;
    end if;
  end if;

  delete from public.meat_calculation_settings
  where id = p_setting_id;
end;
$$;

revoke all on function public.archive_seasoning(uuid) from public, anon;
grant execute on function public.archive_seasoning(uuid) to authenticated;

revoke all on function public.archive_meat_customer(uuid) from public, anon;
grant execute on function public.archive_meat_customer(uuid) to authenticated;

revoke all on function public.unapply_meat_seasoning_cost_version(uuid)
  from public, anon;
grant execute on function public.unapply_meat_seasoning_cost_version(uuid)
  to authenticated;

revoke all on function public.delete_meat_calculation_setting(uuid)
  from public, anon;
grant execute on function public.delete_meat_calculation_setting(uuid)
  to authenticated;
