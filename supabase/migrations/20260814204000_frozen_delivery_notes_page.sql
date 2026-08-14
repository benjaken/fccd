-- Delivery-note management page under Frozen Goods, plus delete for Factory.

do $$
declare
  target_sort integer;
begin
  select coalesce(
    (
      select sort_order + 1
      from public.app_pages
      where page_key = 'frozen.prepared_meat_inventory'
    ),
    51
  )
  into target_sort;

  if not exists (
    select 1
    from public.app_pages
    where page_key = 'frozen.delivery_notes'
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
    where page_key = 'frozen.delivery_notes';
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
      'frozen.delivery_notes',
      '送貨單管理',
      '/frozen/delivery-notes',
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
  where page_key in ('frozen', 'frozen.delivery_notes')
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

create or replace function public.delete_meat_delivery_note(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_page_access('frozen.delivery_notes') then
    raise exception 'not authorized to delete delivery notes'
      using errcode = '42501';
  end if;

  if p_order_id is null then
    raise exception 'meat order not found'
      using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.meat_orders where id = p_order_id) then
    raise exception 'meat order not found'
      using errcode = 'P0002';
  end if;

  delete from public.prepared_meat_stock_raw_sources
  where prepared_movement_id in (
    select movement.id
    from public.prepared_meat_stock_movements as movement
    join public.meat_order_lines as line
      on line.id = movement.meat_order_line_id
    where line.meat_order_id = p_order_id
  )
  or raw_stock_movement_id in (
    select movement.id
    from public.raw_meat_stock_movements as movement
    join public.meat_order_lines as line
      on line.id = movement.meat_order_line_id
    where line.meat_order_id = p_order_id
  );

  delete from public.meat_yield_errors
  where prepared_stock_movement_id in (
    select movement.id
    from public.prepared_meat_stock_movements as movement
    join public.meat_order_lines as line
      on line.id = movement.meat_order_line_id
    where line.meat_order_id = p_order_id
  );

  delete from public.raw_meat_stock_relations
  where movement_id in (
    select movement.id
    from public.raw_meat_stock_movements as movement
    join public.meat_order_lines as line
      on line.id = movement.meat_order_line_id
    where line.meat_order_id = p_order_id
  )
  or inbound_movement_id in (
    select movement.id
    from public.raw_meat_stock_movements as movement
    join public.meat_order_lines as line
      on line.id = movement.meat_order_line_id
    where line.meat_order_id = p_order_id
  );

  delete from public.prepared_meat_stock_movements
  where meat_order_line_id in (
    select id from public.meat_order_lines where meat_order_id = p_order_id
  );

  delete from public.raw_meat_stock_movements
  where meat_order_line_id in (
    select id from public.meat_order_lines where meat_order_id = p_order_id
  );

  delete from public.meat_order_lines
  where meat_order_id = p_order_id;

  delete from public.meat_orders
  where id = p_order_id;

  return p_order_id;
end;
$$;

revoke all on function public.delete_meat_delivery_note(uuid) from public;
grant execute on function public.delete_meat_delivery_note(uuid) to authenticated;

comment on function public.delete_meat_delivery_note(uuid) is
  'Deletes a meat delivery note and reverses its prepared/raw stock movements.';
