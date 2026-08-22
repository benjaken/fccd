-- Restaurant stocktakes use two canonical departments. Historical kitchen
-- records remain readable as restaurant records, while ingredient mappings
-- continue to use their existing kitchen name.

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
    case when event.department_name = '水吧' then '水吧' else '餐廳' end as department_name,
    max(event.updated_at) as updated_at
  from public.restaurant_stocktake_events event
  join public.restaurants restaurant on restaurant.id = event.restaurant_id
  where event.stocktake_at is not null
    and event.restaurant_id is not null
    and event.department_name in ('餐廳', '廚房', '水吧')
  group by 1, event.restaurant_id, restaurant.name, 4
  order by 1 desc, restaurant.name, 4;
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
      and (
        (p_department_name = '餐廳' and event.department_name in ('餐廳', '廚房'))
        or (p_department_name = '水吧' and event.department_name = '水吧')
      )
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
  canonical_department text := btrim(p_department_name);
  ingredient_department text;
  inserted_count integer;
begin
  if p_month is null or p_restaurant_id is null or canonical_department is null or canonical_department not in ('餐廳', '水吧') then
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

  ingredient_department := case when canonical_department = '餐廳' then '廚房' else '水吧' end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(month_start::text || ':' || p_restaurant_id::text || ':' || canonical_department, 0)
  );

  if exists (
    select 1
    from public.restaurant_stocktake_events event
    where event.restaurant_id = p_restaurant_id
      and (
        (canonical_department = '餐廳' and event.department_name in ('餐廳', '廚房'))
        or (canonical_department = '水吧' and event.department_name = '水吧')
      )
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
    'web-restaurant-stocktake:' || month_start::text || ':' || p_restaurant_id::text || ':' || canonical_department || ':' || ingredient.id::text,
    restaurant.id,
    restaurant.legacy_id,
    ingredient.id,
    ingredient.legacy_id,
    supplier.id,
    supplier.legacy_id,
    canonical_department,
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
   and item_department.department_name = ingredient_department
  left join public.suppliers supplier on supplier.id = ingredient.supplier_id
  where restaurant.id = p_restaurant_id;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    raise exception 'restaurant_stocktake_no_items';
  end if;
  return inserted_count;
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
declare
  month_start date := date_trunc('month', p_month)::date;
  canonical_department text := btrim(p_department_name);
begin
  if canonical_department is null or canonical_department not in ('餐廳', '水吧') then
    raise exception 'restaurant_stocktake_department_invalid';
  end if;
  if not private.has_page_access('restaurant.inventory.delete') then
    raise exception 'not_authorized';
  end if;
  delete from public.restaurant_stocktake_events event
  where event.restaurant_id = p_restaurant_id
    and (
      (canonical_department = '餐廳' and event.department_name in ('餐廳', '廚房'))
      or (canonical_department = '水吧' and event.department_name = '水吧')
    )
    and event.stocktake_at >= (month_start::timestamp at time zone 'Asia/Hong_Kong')
    and event.stocktake_at < ((month_start + interval '1 month')::timestamp at time zone 'Asia/Hong_Kong');
end;
$$;

revoke all on function public.get_restaurant_stocktake_records() from public, anon;
revoke all on function public.get_restaurant_stocktake_items(date, uuid, text, text, integer, integer) from public, anon;
revoke all on function public.create_restaurant_stocktake(date, uuid, text) from public, anon;
revoke all on function public.delete_restaurant_stocktake(date, uuid, text) from public, anon;
grant execute on function public.get_restaurant_stocktake_records() to authenticated;
grant execute on function public.get_restaurant_stocktake_items(date, uuid, text, text, integer, integer) to authenticated;
grant execute on function public.create_restaurant_stocktake(date, uuid, text) to authenticated;
grant execute on function public.delete_restaurant_stocktake(date, uuid, text) to authenticated;
