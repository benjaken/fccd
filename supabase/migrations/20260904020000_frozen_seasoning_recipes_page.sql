-- Fixed seasoning recipes page under Frozen Goods.

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
    'frozen.seasoning_recipes',
    '固定香料成本',
    '/frozen/seasoning-recipes',
    46,
    false,
    'frozen',
    'subpage'
  ),
  (
    'frozen.seasoning_recipes.edit',
    '編輯固定香料成本',
    '/frozen/seasoning-recipes/actions/edit',
    460,
    true,
    'frozen.seasoning_recipes',
    'action'
  ),
  (
    'frozen.seasoning_recipes.delete',
    '刪除固定香料成本',
    '/frozen/seasoning-recipes/actions/delete',
    461,
    true,
    'frozen.seasoning_recipes',
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
  'frozen.seasoning_recipes',
  case
    when roles.role = 'Super Admin' then true
    when roles.role in ('Admin', 'Factory') then true
    when parent_perm.can_access is not null then parent_perm.can_access
    else false
  end,
  roles.role = 'Super Admin'
from roles
left join public.role_page_permissions parent_perm
  on parent_perm.role = roles.role
 and parent_perm.page_key = 'frozen'
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
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
  roles.role in ('Super Admin', 'Admin', 'Factory'),
  roles.role = 'Super Admin'
from roles
cross join (
  values
    ('frozen.seasoning_recipes.edit'),
    ('frozen.seasoning_recipes.delete')
) as pages(page_key)
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();

create or replace function public.save_meat_seasoning_recipe(
  p_prepared_meat_item_id uuid,
  p_version_code numeric,
  p_production_raw_meat_kg numeric,
  p_lines jsonb,
  p_previous_version_code numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_meat_item_id uuid;
  v_is_applied boolean := false;
  v_line jsonb;
  v_sort integer := 0;
  v_seasoning_id uuid;
  v_quantity numeric;
  v_unit_cost numeric;
  v_now timestamptz := now();
begin
  if not private.has_page_access('frozen.seasoning_recipes.edit') then
    raise exception 'not authorized to edit seasoning recipes'
      using errcode = '42501';
  end if;

  if p_prepared_meat_item_id is null then
    raise exception 'prepared meat item is required'
      using errcode = '22023';
  end if;

  if p_version_code is null or p_version_code < 10000101 or p_version_code > 99991231 then
    raise exception 'seasoning code must be yyyymmdd'
      using errcode = '22023';
  end if;

  if p_production_raw_meat_kg is null or p_production_raw_meat_kg <= 0 then
    raise exception 'production raw meat kg must be greater than 0'
      using errcode = '22023';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one seasoning line is required'
      using errcode = '22023';
  end if;

  select prepared.raw_meat_item_id
  into v_raw_meat_item_id
  from public.prepared_meat_items as prepared
  where prepared.id = p_prepared_meat_item_id
    and prepared.archived_at is null;

  if not found then
    raise exception 'prepared meat item not found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.meat_seasoning_cost_versions
    where prepared_meat_item_id = p_prepared_meat_item_id
      and version_code = p_version_code
      and (
        p_previous_version_code is null
        or version_code is distinct from p_previous_version_code
      )
  ) then
    raise exception 'seasoning recipe code already exists'
      using errcode = '23505';
  end if;

  if p_previous_version_code is not null then
    if not exists (
      select 1
      from public.meat_seasoning_cost_versions
      where prepared_meat_item_id = p_prepared_meat_item_id
        and version_code = p_previous_version_code
    ) then
      raise exception 'seasoning recipe not found'
        using errcode = 'P0002';
    end if;

    select coalesce(bool_or(is_applied), false)
    into v_is_applied
    from public.meat_seasoning_cost_versions
    where prepared_meat_item_id = p_prepared_meat_item_id
      and version_code = p_previous_version_code;

    delete from public.meat_seasoning_cost_versions
    where prepared_meat_item_id = p_prepared_meat_item_id
      and version_code = p_previous_version_code;
  end if;

  for v_line in
    select value
    from jsonb_array_elements(p_lines) as value
  loop
    v_sort := v_sort + 1;
    v_seasoning_id := nullif(v_line ->> 'seasoning_id', '')::uuid;
    v_quantity := nullif(v_line ->> 'quantity_grams', '')::numeric;

    if v_seasoning_id is null then
      raise exception 'seasoning is required'
        using errcode = '22023';
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'seasoning quantity must be greater than 0'
        using errcode = '22023';
    end if;

    select seasonings.cost_per_gram
    into v_unit_cost
    from public.seasonings
    where seasonings.id = v_seasoning_id
      and seasonings.archived_at is null;

    if not found then
      raise exception 'seasoning not found'
        using errcode = 'P0002';
    end if;

    insert into public.meat_seasoning_cost_versions (
      legacy_id,
      prepared_meat_item_id,
      prepared_meat_item_legacy_id,
      raw_meat_item_id,
      raw_meat_item_legacy_id,
      seasoning_id,
      seasoning_legacy_id,
      production_raw_meat_kg,
      seasoning_quantity_grams,
      total_cost,
      unit_cost,
      version_code,
      seasoning_sort,
      is_applied,
      bubble_created_at,
      bubble_modified_at
    )
    values (
      'web-seasoning-recipe-' || gen_random_uuid()::text,
      p_prepared_meat_item_id,
      (select prepared.legacy_id from public.prepared_meat_items as prepared where prepared.id = p_prepared_meat_item_id),
      v_raw_meat_item_id,
      (
        select raw.legacy_id
        from public.raw_meat_items as raw
        where raw.id = v_raw_meat_item_id
      ),
      v_seasoning_id,
      (
        select seasonings.legacy_id
        from public.seasonings
        where seasonings.id = v_seasoning_id
      ),
      round(p_production_raw_meat_kg, 3),
      round(v_quantity, 3),
      round(coalesce(v_unit_cost, 0) * v_quantity, 4),
      v_unit_cost,
      p_version_code,
      v_sort,
      coalesce(v_is_applied, false),
      v_now,
      v_now
    );
  end loop;
end;
$$;

create or replace function public.delete_meat_seasoning_recipe(
  p_prepared_meat_item_id uuid,
  p_version_code numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_page_access('frozen.seasoning_recipes.delete') then
    raise exception 'not authorized to delete seasoning recipes'
      using errcode = '42501';
  end if;

  delete from public.meat_seasoning_cost_versions
  where prepared_meat_item_id = p_prepared_meat_item_id
    and version_code = p_version_code;

  if not found then
    raise exception 'seasoning recipe not found'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.set_meat_seasoning_recipe_applied(
  p_prepared_meat_item_id uuid,
  p_version_code numeric,
  p_is_applied boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_page_access('frozen.seasoning_recipes.edit') then
    raise exception 'not authorized to edit seasoning recipes'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.meat_seasoning_cost_versions
    where prepared_meat_item_id = p_prepared_meat_item_id
      and version_code = p_version_code
  ) then
    raise exception 'seasoning recipe not found'
      using errcode = 'P0002';
  end if;

  if p_is_applied then
    update public.meat_seasoning_cost_versions
    set is_applied = false
    where prepared_meat_item_id = p_prepared_meat_item_id
      and version_code is distinct from p_version_code
      and is_applied;
  end if;

  update public.meat_seasoning_cost_versions
  set is_applied = p_is_applied
  where prepared_meat_item_id = p_prepared_meat_item_id
    and version_code = p_version_code;
end;
$$;

revoke all on function public.save_meat_seasoning_recipe(uuid, numeric, numeric, jsonb, numeric)
  from public;
grant execute on function public.save_meat_seasoning_recipe(uuid, numeric, numeric, jsonb, numeric)
  to authenticated;

revoke all on function public.delete_meat_seasoning_recipe(uuid, numeric)
  from public;
grant execute on function public.delete_meat_seasoning_recipe(uuid, numeric)
  to authenticated;

revoke all on function public.set_meat_seasoning_recipe_applied(uuid, numeric, boolean)
  from public;
grant execute on function public.set_meat_seasoning_recipe_applied(uuid, numeric, boolean)
  to authenticated;

comment on function public.save_meat_seasoning_recipe(uuid, numeric, numeric, jsonb, numeric) is
  'Creates or replaces a prepared-meat seasoning recipe version and its spice lines.';

comment on function public.delete_meat_seasoning_recipe(uuid, numeric) is
  'Deletes every line of a prepared-meat seasoning recipe version.';

comment on function public.set_meat_seasoning_recipe_applied(uuid, numeric, boolean) is
  'Applies or unapplies a seasoning recipe. Applying one version unapplies the others for that product.';
