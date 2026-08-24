-- Monthly restaurant stocktake records, grouped by restaurant and department.

alter table public.restaurant_stocktake_events
  add column if not exists updated_at timestamptz;

update public.restaurant_stocktake_events
set updated_at = coalesce(
  bubble_modified_at,
  bubble_created_at,
  created_at,
  stocktake_at,
  now()
)
where updated_at is null;

alter table public.restaurant_stocktake_events
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists restaurant_stocktake_events_record_lookup_idx
  on public.restaurant_stocktake_events (restaurant_id, department_name, stocktake_at);

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values
  ('restaurant.inventory', '餐廳盤點記錄', '/restaurant/inventory', 81, false, 'restaurant', 'subpage'),
  ('restaurant.inventory.edit', '新增及編輯餐廳盤點', '/restaurant/inventory/actions/edit', 82, true, 'restaurant.inventory', 'action'),
  ('restaurant.inventory.delete', '刪除餐廳盤點', '/restaurant/inventory/actions/delete', 83, true, 'restaurant.inventory', 'action')
on conflict (page_key) do update
set display_name = excluded.display_name,
    route = excluded.route,
    sort_order = excluded.sort_order,
    is_high_risk = excluded.is_high_risk,
    parent_page_key = excluded.parent_page_key,
    page_kind = excluded.page_kind,
    updated_at = now();

with roles(role) as (
  values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'), ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
), pages(page_key) as (
  values ('restaurant.inventory'), ('restaurant.inventory.edit'), ('restaurant.inventory.delete')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role,
       pages.page_key,
       case
         when pages.page_key = 'restaurant.inventory'
           then roles.role in ('Super Admin', 'Admin', 'Accounting', 'Shop manager')
         else roles.role in ('Super Admin', 'Admin', 'Shop manager')
       end,
       roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update
set can_access = public.role_page_permissions.can_access or excluded.can_access,
    can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
    updated_at = now();

drop policy if exists "Restaurant stocktake page readers" on public.restaurant_stocktake_events;
create policy "Restaurant stocktake page readers"
on public.restaurant_stocktake_events for select to authenticated
using (private.has_page_access('restaurant.inventory'));

drop policy if exists "Restaurant stocktake page editors" on public.restaurant_stocktake_events;
create policy "Restaurant stocktake page editors"
on public.restaurant_stocktake_events for update to authenticated
using (private.has_page_access('restaurant.inventory.edit'))
with check (private.has_page_access('restaurant.inventory.edit'));

drop policy if exists "Restaurant stocktake page creators" on public.restaurant_stocktake_events;
create policy "Restaurant stocktake page creators"
on public.restaurant_stocktake_events for insert to authenticated
with check (private.has_page_access('restaurant.inventory.edit'));

drop policy if exists "Restaurant stocktake page deleters" on public.restaurant_stocktake_events;
create policy "Restaurant stocktake page deleters"
on public.restaurant_stocktake_events for delete to authenticated
using (private.has_page_access('restaurant.inventory.delete'));

drop policy if exists "Restaurant stocktake restaurant readers" on public.restaurants;
create policy "Restaurant stocktake restaurant readers"
on public.restaurants for select to authenticated
using (private.has_page_access('restaurant.inventory'));

drop policy if exists "Restaurant stocktake department readers" on public.restaurant_departments;
create policy "Restaurant stocktake department readers"
on public.restaurant_departments for select to authenticated
using (private.has_page_access('restaurant.inventory'));

drop policy if exists "Restaurant stocktake item readers" on public.restaurant_ingredients;
create policy "Restaurant stocktake item readers"
on public.restaurant_ingredients for select to authenticated
using (private.has_page_access('restaurant.inventory'));

drop policy if exists "Restaurant stocktake item department readers" on public.restaurant_ingredient_departments;
create policy "Restaurant stocktake item department readers"
on public.restaurant_ingredient_departments for select to authenticated
using (private.has_page_access('restaurant.inventory'));

drop policy if exists "Restaurant stocktake supplier readers" on public.suppliers;
create policy "Restaurant stocktake supplier readers"
on public.suppliers for select to authenticated
using (private.has_page_access('restaurant.inventory'));

create or replace function public.get_restaurant_stocktake_records()
returns table (
  record_month date,
  restaurant_id uuid,
  restaurant_name text,
  department_name text,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc('month', event.stocktake_at at time zone 'Asia/Hong_Kong')::date as record_month,
    event.restaurant_id,
    restaurant.name as restaurant_name,
    event.department_name,
    max(event.updated_at) as updated_at
  from public.restaurant_stocktake_events event
  join public.restaurants restaurant on restaurant.id = event.restaurant_id
  where event.stocktake_at is not null
    and event.restaurant_id is not null
    and nullif(btrim(event.department_name), '') is not null
  group by 1, event.restaurant_id, restaurant.name, event.department_name
  order by 1 desc, restaurant.name, event.department_name;
$$;

create or replace function public.get_restaurant_stocktake_items(
  p_month date,
  p_restaurant_id uuid,
  p_department_name text,
  p_search text default null,
  p_limit integer default 15,
  p_offset integer default 0
)
returns table (
  id uuid,
  supplier_name text,
  item_name text,
  unit text,
  unit_cost numeric,
  quantity numeric,
  total_cost numeric,
  total_count bigint,
  inventory_value numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select
      event.id,
      supplier.company_name as supplier_name,
      ingredient.name as item_name,
      ingredient.unit,
      coalesce(event.unit_cost, ingredient.cost_per_unit, 0) as unit_cost,
      event.quantity,
      coalesce(event.total_cost, event.quantity * coalesce(event.unit_cost, ingredient.cost_per_unit, 0), 0) as total_cost
    from public.restaurant_stocktake_events event
    join public.restaurant_ingredients ingredient on ingredient.id = event.restaurant_ingredient_id
    left join public.suppliers supplier on supplier.id = coalesce(event.supplier_id, ingredient.supplier_id)
    where event.restaurant_id = p_restaurant_id
      and event.department_name = p_department_name
      and event.stocktake_at >= (date_trunc('month', p_month)::date::timestamp at time zone 'Asia/Hong_Kong')
      and event.stocktake_at < ((date_trunc('month', p_month) + interval '1 month')::date::timestamp at time zone 'Asia/Hong_Kong')
      and (
        nullif(btrim(p_search), '') is null
        or ingredient.name ilike '%' || btrim(p_search) || '%'
        or supplier.company_name ilike '%' || btrim(p_search) || '%'
      )
  ), measured as (
    select filtered.*,
           count(*) over () as total_count,
           sum(filtered.total_cost) over () as inventory_value
    from filtered
  )
  select measured.id,
         measured.supplier_name,
         measured.item_name,
         measured.unit,
         measured.unit_cost,
         measured.quantity,
         measured.total_cost,
         measured.total_count,
         measured.inventory_value
  from measured
  order by measured.supplier_name nulls first, measured.item_name, measured.id
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.create_restaurant_stocktake(
  p_month date,
  p_restaurant_id uuid,
  p_department_name text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  month_start date := date_trunc('month', p_month)::date;
  inserted_count integer;
begin
  if p_month is null or p_restaurant_id is null or nullif(btrim(p_department_name), '') is null then
    raise exception 'restaurant_stocktake_fields_required';
  end if;
  if not private.has_page_access('restaurant.inventory.edit') then
    raise exception 'not_authorized';
  end if;
  if not exists (
    select 1 from public.restaurants restaurant
    where restaurant.id = p_restaurant_id and restaurant.is_active and restaurant.archived_at is null
  ) then
    raise exception 'restaurant_stocktake_restaurant_invalid';
  end if;
  if not exists (
    select 1 from public.restaurant_departments department
    where department.name = btrim(p_department_name) and department.is_active and department.archived_at is null
  ) then
    raise exception 'restaurant_stocktake_department_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(month_start::text || ':' || p_restaurant_id::text || ':' || btrim(p_department_name), 0)
  );

  if exists (
    select 1
    from public.restaurant_stocktake_events event
    where event.restaurant_id = p_restaurant_id
      and event.department_name = btrim(p_department_name)
      and event.stocktake_at >= (month_start::timestamp at time zone 'Asia/Hong_Kong')
      and event.stocktake_at < ((month_start + interval '1 month')::timestamp at time zone 'Asia/Hong_Kong')
  ) then
    raise exception 'restaurant_stocktake_record_exists' using errcode = '23505';
  end if;

  insert into public.restaurant_stocktake_events (
    legacy_id,
    restaurant_id,
    restaurant_legacy_id,
    restaurant_ingredient_id,
    restaurant_ingredient_legacy_id,
    supplier_id,
    supplier_legacy_id,
    department_name,
    stocktake_at,
    quantity,
    unit_cost,
    total_cost,
    bubble_created_at,
    created_at,
    updated_at
  )
  select
    'web-restaurant-stocktake:' || month_start::text || ':' || p_restaurant_id::text || ':' || btrim(p_department_name) || ':' || ingredient.id::text,
    restaurant.id,
    restaurant.legacy_id,
    ingredient.id,
    ingredient.legacy_id,
    supplier.id,
    supplier.legacy_id,
    btrim(p_department_name),
    (month_start::timestamp at time zone 'Asia/Hong_Kong'),
    null,
    coalesce(ingredient.cost_per_unit, 0),
    0,
    now(),
    now(),
    now()
  from public.restaurants restaurant
  join public.restaurant_ingredients ingredient on ingredient.is_active and ingredient.archived_at is null
  join public.restaurant_ingredient_departments item_department
    on item_department.restaurant_ingredient_id = ingredient.id
   and item_department.department_name = btrim(p_department_name)
  left join public.suppliers supplier on supplier.id = ingredient.supplier_id
  where restaurant.id = p_restaurant_id;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    raise exception 'restaurant_stocktake_no_items';
  end if;
  return inserted_count;
end;
$$;

create or replace function public.update_restaurant_stocktake_quantity(p_id uuid, p_quantity numeric)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_page_access('restaurant.inventory.edit') then
    raise exception 'not_authorized';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'restaurant_stocktake_quantity_invalid';
  end if;
  update public.restaurant_stocktake_events
  set quantity = p_quantity,
      total_cost = round(p_quantity * coalesce(unit_cost, 0), 2),
      updated_at = now()
  where id = p_id;
  if not found then raise exception 'restaurant_stocktake_item_not_found'; end if;
end;
$$;

create or replace function public.delete_restaurant_stocktake(
  p_month date,
  p_restaurant_id uuid,
  p_department_name text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare month_start date := date_trunc('month', p_month)::date;
begin
  if not private.has_page_access('restaurant.inventory.delete') then
    raise exception 'not_authorized';
  end if;
  delete from public.restaurant_stocktake_events event
  where event.restaurant_id = p_restaurant_id
    and event.department_name = btrim(p_department_name)
    and event.stocktake_at >= (month_start::timestamp at time zone 'Asia/Hong_Kong')
    and event.stocktake_at < ((month_start + interval '1 month')::timestamp at time zone 'Asia/Hong_Kong');
end;
$$;

revoke all on function public.get_restaurant_stocktake_records() from public, anon;
revoke all on function public.get_restaurant_stocktake_items(date, uuid, text, text, integer, integer) from public, anon;
revoke all on function public.create_restaurant_stocktake(date, uuid, text) from public, anon;
revoke all on function public.update_restaurant_stocktake_quantity(uuid, numeric) from public, anon;
revoke all on function public.delete_restaurant_stocktake(date, uuid, text) from public, anon;
grant execute on function public.get_restaurant_stocktake_records() to authenticated;
grant execute on function public.get_restaurant_stocktake_items(date, uuid, text, text, integer, integer) to authenticated;
grant execute on function public.create_restaurant_stocktake(date, uuid, text) to authenticated;
grant execute on function public.update_restaurant_stocktake_quantity(uuid, numeric) to authenticated;
grant execute on function public.delete_restaurant_stocktake(date, uuid, text) to authenticated;
