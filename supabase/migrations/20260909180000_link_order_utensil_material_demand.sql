-- Generated utensil order lines do not carry a product/package id. Map their
-- explicit names at the canonical material-requirement seam so forecasts and
-- committed delivery deductions use the same quantities.
create or replace function private.catering_line_material_requirements(
  p_order_line_id uuid
)
returns table (
  ingredient_id uuid,
  required_quantity numeric,
  calculation_source text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with selected_line as (
    select line.*,
      regexp_replace(
        coalesce(nullif(line.product_name_snapshot, ''), line.content_snapshot, ''),
        '\s+', '', 'g'
      ) as normalized_name
    from public.order_lines line
    where line.id = p_order_line_id and line.is_void is false
  ), snapshot as (
    select requirement.ingredient_id,
      sum(coalesce(
        requirement.calculated_quantity / nullif(requirement.product_quantity, 0) * line.quantity,
        requirement.ingredient_quantity * coalesce(line.quantity, 0),
        requirement.calculated_quantity,
        0
      ))::numeric as required_quantity
    from selected_line line
    join public.order_bom_requirements requirement
      on requirement.order_line_id = line.id
    where requirement.ingredient_id is not null
      and requirement.material_line_version = coalesce((select version
        from private.material_line_versions where order_line_id = line.id), 0)
      and coalesce(requirement.calculated_quantity, requirement.ingredient_quantity) is not null
    group by requirement.ingredient_id
  ), fallback as (
    select recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(line.quantity, 0))::numeric as required_quantity,
      'product_bom'::text as calculation_source
    from selected_line line
    join public.product_ingredients recipe on recipe.product_id = line.product_id
    where recipe.ingredient_id is not null
      and not exists (
        select 1 from snapshot where snapshot.ingredient_id = recipe.ingredient_id
      )
    group by recipe.ingredient_id

    union all

    select recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(line.quantity, 0))::numeric,
      'package_bom'::text
    from selected_line line
    join public.product_ingredients recipe on recipe.package_id = line.package_id
    where recipe.ingredient_id is not null
      and not exists (
        select 1 from snapshot where snapshot.ingredient_id = recipe.ingredient_id
      )
    group by recipe.ingredient_id

    union all

    select recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(package_product.quantity, 1)
        * coalesce(line.quantity, 0))::numeric,
      'package_bom'::text
    from selected_line line
    join public.order_package_choice_snapshots choice
      on choice.order_line_id = line.id and choice.is_selected
    join public.package_products package_product
      on package_product.id = choice.package_product_id
      and package_product.package_id = line.package_id
    join public.product_ingredients recipe
      on recipe.product_id = package_product.product_id
    where recipe.ingredient_id is not null
      and not exists (
        select 1 from snapshot where snapshot.ingredient_id = recipe.ingredient_id
      )
    group by recipe.ingredient_id

    union all

    select recipe.ingredient_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(package_product.quantity, 1)
        * coalesce(line.quantity, 0))::numeric,
      'package_bom'::text
    from selected_line line
    join public.package_products package_product
      on package_product.package_id = line.package_id and package_product.is_selected
    join public.product_ingredients recipe
      on recipe.product_id = package_product.product_id
    where not exists (
        select 1 from public.order_package_choice_snapshots choice
        left join public.package_products chosen on chosen.id = choice.package_product_id
        where choice.order_line_id = line.id
          and coalesce(chosen.package_id, choice.package_id) = line.package_id
      )
      and recipe.ingredient_id is not null
      and not exists (
        select 1 from snapshot where snapshot.ingredient_id = recipe.ingredient_id
      )
    group by recipe.ingredient_id
  ), named_utensils as (
    select ingredient.id as ingredient_id,
      sum(coalesce(line.quantity, 0))::numeric as required_quantity,
      'product_bom'::text as calculation_source
    from selected_line line
    join public.ingredients ingredient
      on ingredient.id = 'c6621db1-b21f-4b62-b6cb-0aef12e34c01'
      and ingredient.name = '餐具包'
      and ingredient.archived_at is null
      and ingredient.is_active
    where line.normalized_name ~ '^餐具包(?:[(（]6位[)）])?$'
      and not exists (
        select 1 from snapshot where snapshot.ingredient_id = ingredient.id
      )
      and not exists (
        select 1 from fallback where fallback.ingredient_id = ingredient.id
      )
    group by ingredient.id

    union all

    select ingredient.id,
      sum(
        substring(line.normalized_name
          from '^飯盒餐具包([0-9]+(?:\.[0-9]+)?)份$')::numeric
        * coalesce(line.quantity, 0)
      )::numeric,
      'product_bom'::text
    from selected_line line
    join public.ingredients ingredient
      on ingredient.id = '5346734a-df61-4d46-91ed-17db6985c5e6'
      and ingredient.name = '中式餐具包'
      and ingredient.archived_at is null
      and ingredient.is_active
    where line.normalized_name ~ '^飯盒餐具包[0-9]+(?:\.[0-9]+)?份$'
      and not exists (
        select 1 from snapshot where snapshot.ingredient_id = ingredient.id
      )
      and not exists (
        select 1 from fallback where fallback.ingredient_id = ingredient.id
      )
    group by ingredient.id
  ), combined as (
    select snapshot.ingredient_id, snapshot.required_quantity,
      'order_bom'::text as calculation_source
    from snapshot
    union all
    select fallback.ingredient_id, fallback.required_quantity,
      fallback.calculation_source
    from fallback
    union all
    select named_utensils.ingredient_id, named_utensils.required_quantity,
      named_utensils.calculation_source
    from named_utensils
  )
  select combined.ingredient_id,
    case
      when nullif(btrim(ingredient.product_unit), '') is not null
        and nullif(btrim(ingredient.stocktake_unit), '') is not null
        and lower(btrim(ingredient.product_unit))
          <> lower(btrim(ingredient.stocktake_unit))
        and ingredient.product_quantity > 0
      then sum(combined.required_quantity) / ingredient.product_quantity
      else sum(combined.required_quantity)
    end::numeric,
    case
      when bool_or(combined.calculation_source = 'order_bom') then 'order_bom'
      when bool_or(combined.calculation_source = 'package_bom') then 'package_bom'
      else 'product_bom'
    end
  from combined
  join public.ingredients ingredient on ingredient.id = combined.ingredient_id
  group by combined.ingredient_id, ingredient.product_unit,
    ingredient.stocktake_unit, ingredient.product_quantity
  having sum(combined.required_quantity) > 0;
$$;

comment on function private.catering_line_material_requirements(uuid) is
  'Canonical catering BOM and generated utensil-line calculation normalized to stocktake units.';

-- Reconcile only current/future committed deliveries. Pending orders will use
-- the new canonical requirement automatically when they later commit stock.
do $reconcile_current_utensils$
declare
  affected_order_id uuid;
begin
  for affected_order_id in
    select distinct line.order_id
    from public.order_lines line
    join public.deliveries delivery on delivery.order_id = line.order_id
    where line.is_void is false
      and regexp_replace(
        coalesce(nullif(line.product_name_snapshot, ''), line.content_snapshot, ''),
        '\s+', '', 'g'
      ) ~ '^(餐具包(?:[(（]6位[)）])?|飯盒餐具包[0-9]+(?:\.[0-9]+)?份)$'
      and private.delivery_material_is_committed(delivery.delivery_status)
      and (delivery.delivery_at at time zone 'Asia/Hong_Kong')::date >=
        (now() at time zone 'Asia/Hong_Kong')::date
  loop
    perform private.reconcile_order_material_consumption(
      affected_order_id,
      'utensil_material_mapping_deployed'
    );
  end loop;
end
$reconcile_current_utensils$;
