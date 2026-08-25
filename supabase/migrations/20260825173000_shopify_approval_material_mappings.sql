begin;

-- Reviewers need the active ingredient catalogue in order to prepare mappings.
drop policy if exists "Shopify catalog reviewers read ingredients" on public.ingredients;
create policy "Shopify catalog reviewers read ingredients"
on public.ingredients for select to authenticated
using (private.has_page_access('products.shopify_pending'));

create or replace function public.approve_shopify_pending_catalog_item_with_materials(
  p_draft_id uuid,
  p_expected_updated_at timestamptz,
  p_review_note text default null,
  p_materials jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_draft public.shopify_catalog_drafts%rowtype;
  v_material record;
  v_ingredient public.ingredients%rowtype;
  v_target record;
begin
  if jsonb_typeof(coalesce(p_materials, '[]'::jsonb)) <> 'array' then
    raise exception 'shopify_catalog_materials_invalid' using errcode = '22023';
  end if;

  -- The existing approval remains authoritative. Any mapping error below rolls
  -- this call back in the same transaction, so approval and BOM stay atomic.
  v_result := public.approve_shopify_pending_catalog_item(
    p_draft_id,
    p_expected_updated_at,
    p_review_note
  );

  select * into v_draft
  from public.shopify_catalog_drafts
  where id = p_draft_id;

  for v_material in
    select
      material."ingredientId" as ingredient_id,
      material.kind,
      material.quantity
    from jsonb_to_recordset(coalesce(p_materials, '[]'::jsonb))
      as material("ingredientId" uuid, kind text, quantity numeric)
  loop
    if v_material.kind not in ('ingredient', 'packing')
      or v_material.quantity is null
      or v_material.quantity <= 0 then
      raise exception 'shopify_catalog_material_invalid' using errcode = '22023';
    end if;

    select * into v_ingredient
    from public.ingredients
    where id = v_material.ingredient_id
      and archived_at is null
      and is_active;
    if not found then
      raise exception 'shopify_catalog_material_not_found' using errcode = 'P0002';
    end if;
    if (v_material.kind = 'packing') is distinct from (v_ingredient.ingredient_type = '包裝用品') then
      raise exception 'shopify_catalog_material_kind_mismatch' using errcode = '22023';
    end if;

    if v_draft.catalog_type = 'product' then
      for v_target in
        select mapping.internal_product_id as product_id, product.legacy_id as product_legacy_id
        from public.shopify_catalog_mappings mapping
        join public.products product on product.id = mapping.internal_product_id
        where mapping.store_id = v_draft.store_id
          and mapping.resource_type = 'product_variant'
          and mapping.shopify_product_id = v_draft.shopify_product_id
          and mapping.is_active
      loop
        insert into public.product_ingredients(
          legacy_id, ingredient_id, ingredient_legacy_id,
          product_id, product_legacy_id, quantity, created_at, updated_at
        ) values (
          format('shopify-material:%s:%s:%s', p_draft_id, v_target.product_id, v_ingredient.id),
          v_ingredient.id, v_ingredient.legacy_id,
          v_target.product_id, v_target.product_legacy_id,
          v_material.quantity, now(), now()
        )
        on conflict (legacy_id) do update set
          quantity = excluded.quantity,
          updated_at = now();
      end loop;
    elsif v_draft.catalog_type in ('fixed_package', 'configurable_package') then
      for v_target in
        select mapping.internal_package_id as package_id, package.legacy_id as package_legacy_id
        from public.shopify_catalog_mappings mapping
        join public.packages package on package.id = mapping.internal_package_id
        where mapping.store_id = v_draft.store_id
          and mapping.resource_type = 'package'
          and mapping.shopify_product_id = v_draft.shopify_product_id
          and mapping.is_active
      loop
        insert into public.product_ingredients(
          legacy_id, ingredient_id, ingredient_legacy_id,
          package_id, package_legacy_id, quantity, created_at, updated_at
        ) values (
          format('shopify-material:%s:%s:%s', p_draft_id, v_target.package_id, v_ingredient.id),
          v_ingredient.id, v_ingredient.legacy_id,
          v_target.package_id, v_target.package_legacy_id,
          v_material.quantity, now(), now()
        )
        on conflict (legacy_id) do update set
          quantity = excluded.quantity,
          updated_at = now();
      end loop;
    end if;
  end loop;

  return v_result || jsonb_build_object('materialsAdded', jsonb_array_length(coalesce(p_materials, '[]'::jsonb)));
end;
$$;

revoke all on function public.approve_shopify_pending_catalog_item_with_materials(uuid, timestamptz, text, jsonb)
  from public, anon;
grant execute on function public.approve_shopify_pending_catalog_item_with_materials(uuid, timestamptz, text, jsonb)
  to authenticated;

commit;
