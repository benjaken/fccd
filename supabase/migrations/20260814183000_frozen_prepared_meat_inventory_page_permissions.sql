-- Prepared meat inventory calculation page under Frozen Goods.

do $$
declare
  target_sort integer;
begin
  select coalesce(
    (
      select sort_order
      from public.app_pages
      where page_key = 'frozen.selling_price_cost'
    ),
    (
      select sort_order + 1
      from public.app_pages
      where page_key = 'frozen.raw_meat_inventory.stock_in'
    ),
    (
      select sort_order + 1
      from public.app_pages
      where page_key = 'frozen.raw_meat_inventory'
    ),
    50
  )
  into target_sort;

  if not exists (
    select 1
    from public.app_pages
    where page_key = 'frozen.prepared_meat_inventory'
  ) then
    update public.app_pages
    set
      sort_order = sort_order + 1,
      updated_at = now()
    where page_key like 'frozen.%'
      and sort_order >= target_sort;
  else
    select sort_order
    into target_sort
    from public.app_pages
    where page_key = 'frozen.prepared_meat_inventory';
  end if;

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
      'frozen',
      '凍貨',
      '/frozen',
      45,
      false,
      null,
      'page'
    ),
    (
      'frozen.prepared_meat_inventory',
      '製成品存貨計算',
      '/frozen/prepared-meat-inventory',
      target_sort,
      false,
      'frozen',
      'subpage'
    )
  on conflict (page_key) do update
  set
    display_name = excluded.display_name,
    route = excluded.route,
    is_high_risk = excluded.is_high_risk,
    parent_page_key = excluded.parent_page_key,
    page_kind = excluded.page_kind,
    updated_at = now();
end $$;

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
  where page_key in ('frozen', 'frozen.prepared_meat_inventory')
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
