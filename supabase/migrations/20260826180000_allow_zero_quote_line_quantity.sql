-- Quote and order line quantities remain whole numbers, but zero is a valid
-- value for a line that is being retained without contributing to the total.

create or replace function public.add_quote_line(
  p_order_id uuid,
  p_item_kind text,
  p_item_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_remarks text,
  p_package_choices jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line_id uuid := gen_random_uuid();
  v_order_legacy_id text;
  v_sku text;
  v_name text;
  v_product_id uuid;
  v_package_id uuid;
  v_package_legacy_id text;
  v_item_order numeric;
  v_expected_choice_sets integer;
  v_submitted_choice_sets integer;
  v_choice jsonb;
  v_choice_set record;
  v_selected_count integer;
  v_valid_selected_count integer;
  v_required_count integer;
  v_calculation_id uuid;
  v_calculation_legacy_id text;
begin
  if p_quantity < 0 or p_unit_price < 0 then
    raise exception 'invalid_order_line' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_package_choices, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_package_choices' using errcode = '22023';
  end if;

  select legacy_id into v_order_legacy_id
  from public.orders
  where id = p_order_id
    and document_type in ('quote', 'unconfirmed', 'order')
    and archived_at is null;
  if v_order_legacy_id is null then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  if p_item_kind = 'product' then
    select p.id, p.sku, coalesce(nullif(btrim(p.name), ''), p.chinese_name)
      into v_product_id, v_sku, v_name
    from public.products p
    where p.id = p_item_id and p.archived_at is null;
    if jsonb_array_length(coalesce(p_package_choices, '[]'::jsonb)) > 0 then
      raise exception 'package_choices_for_product' using errcode = '22023';
    end if;
  elsif p_item_kind = 'package' then
    select p.id, p.legacy_id, p.sku, coalesce(nullif(btrim(p.name), ''), p.chinese_name)
      into v_package_id, v_package_legacy_id, v_sku, v_name
    from public.packages p
    where p.id = p_item_id and p.archived_at is null;
  else
    raise exception 'invalid_item_kind' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'catalog_item_not_found' using errcode = 'P0002';
  end if;

  if v_package_id is not null then
    select count(*) into v_expected_choice_sets
    from public.package_choice_sets pcs
    where pcs.package_id = v_package_id
      and exists (
        select 1 from public.package_products pp
        where pp.package_id = v_package_id
          and pp.package_choice_set_legacy_id = pcs.legacy_id
      );

    select count(distinct choice ->> 'choiceSetId') into v_submitted_choice_sets
    from jsonb_array_elements(coalesce(p_package_choices, '[]'::jsonb)) choice;
    if v_submitted_choice_sets <> v_expected_choice_sets
      or jsonb_array_length(coalesce(p_package_choices, '[]'::jsonb)) <> v_expected_choice_sets then
      raise exception 'incomplete_package_choices' using errcode = '22023';
    end if;

    for v_choice in
      select value from jsonb_array_elements(coalesce(p_package_choices, '[]'::jsonb))
    loop
      select pcs.id, pcs.legacy_id, pcs.maximum_choices, count(pp.id)::integer as product_count
        into v_choice_set
      from public.package_choice_sets pcs
      join public.package_products pp
        on pp.package_id = pcs.package_id
       and pp.package_choice_set_legacy_id = pcs.legacy_id
      where pcs.id = (v_choice ->> 'choiceSetId')::uuid
        and pcs.package_id = v_package_id
      group by pcs.id, pcs.legacy_id, pcs.maximum_choices;
      if v_choice_set.id is null then
        raise exception 'invalid_package_choice_set' using errcode = '22023';
      end if;

      select count(distinct selected_id) into v_selected_count
      from jsonb_array_elements_text(coalesce(v_choice -> 'packageProductIds', '[]'::jsonb)) selected_id;
      v_required_count := least(
        v_choice_set.product_count,
        greatest(1, floor(coalesce(v_choice_set.maximum_choices, 1))::integer)
      );
      if v_selected_count <> v_required_count then
        raise exception 'incomplete_package_choice_set' using errcode = '22023';
      end if;

      select count(*) into v_valid_selected_count
      from public.package_products pp
      where pp.package_id = v_package_id
        and pp.package_choice_set_legacy_id = v_choice_set.legacy_id
        and pp.id::text in (
          select jsonb_array_elements_text(coalesce(v_choice -> 'packageProductIds', '[]'::jsonb))
        );
      if v_valid_selected_count <> v_selected_count then
        raise exception 'invalid_package_choice_product' using errcode = '22023';
      end if;
    end loop;
  end if;

  select coalesce(max(item_order), 0) + 1 into v_item_order
  from public.order_lines where order_id = p_order_id;

  insert into public.order_lines (
    id, legacy_id, order_id, product_id, package_id, sku_snapshot,
    product_name_snapshot, quantity, unit_price, total_price, item_order, remarks_1
  ) values (
    v_line_id, 'web-order-line-' || v_line_id, p_order_id, v_product_id,
    v_package_id, v_sku, v_name, p_quantity, p_unit_price,
    round(p_quantity * p_unit_price, 2), v_item_order, nullif(btrim(p_remarks), '')
  );

  if v_package_id is not null then
    for v_choice in
      select value from jsonb_array_elements(coalesce(p_package_choices, '[]'::jsonb))
    loop
      select pcs.id, pcs.legacy_id, pcs.maximum_choices
        into v_choice_set
      from public.package_choice_sets pcs
      where pcs.id = (v_choice ->> 'choiceSetId')::uuid;

      v_calculation_id := gen_random_uuid();
      v_calculation_legacy_id := 'web-production-calculation-' || v_calculation_id;
      insert into public.production_calculations (
        id, legacy_id, order_id, order_legacy_id, order_line_id,
        package_id, package_legacy_id, package_choice_set_id,
        package_choice_set_legacy_id
      ) values (
        v_calculation_id, v_calculation_legacy_id, p_order_id,
        v_order_legacy_id, v_line_id, v_package_id, v_package_legacy_id,
        v_choice_set.id, v_choice_set.legacy_id
      );

      insert into public.order_package_choice_snapshots (
        legacy_id, production_calculation_id, production_calculation_legacy_id,
        order_id, order_legacy_id, order_line_id, package_id,
        package_legacy_id, package_product_id, package_product_legacy_id,
        package_choice_set_id, package_choice_set_legacy_id,
        maximum_choices, is_selected
      )
      select
        'web-order-package-choice-' || gen_random_uuid(),
        v_calculation_id, v_calculation_legacy_id, p_order_id,
        v_order_legacy_id, v_line_id, v_package_id, v_package_legacy_id,
        pp.id, pp.legacy_id, v_choice_set.id, v_choice_set.legacy_id,
        v_choice_set.maximum_choices,
        pp.id::text in (
          select jsonb_array_elements_text(coalesce(v_choice -> 'packageProductIds', '[]'::jsonb))
        )
      from public.package_products pp
      where pp.package_id = v_package_id
        and pp.package_choice_set_legacy_id = v_choice_set.legacy_id;
    end loop;
  end if;

  perform private.recalculate_quote_total(p_order_id);
  return v_line_id;
end;
$$;

create or replace function public.add_quote_line(
  p_order_id uuid,
  p_item_kind text,
  p_item_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_remarks text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  return public.add_quote_line(
    p_order_id,
    p_item_kind,
    p_item_id,
    p_quantity,
    p_unit_price,
    p_remarks,
    '[]'::jsonb
  );
end;
$$;

create or replace function public.add_custom_quote_line(
  p_order_id uuid,
  p_name text,
  p_quantity numeric,
  p_unit_price numeric,
  p_remarks text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line_id uuid := gen_random_uuid();
  v_item_order numeric;
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'custom_product_name_required' using errcode = '22023';
  end if;
  if p_quantity < 0 or p_unit_price < 0 then
    raise exception 'invalid_order_line' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.orders
    where id = p_order_id
      and document_type in ('quote', 'unconfirmed', 'order')
      and archived_at is null
  ) then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  select coalesce(max(item_order), 0) + 1
    into v_item_order
  from public.order_lines
  where order_id = p_order_id;

  insert into public.order_lines (
    id,
    legacy_id,
    order_id,
    product_name_snapshot,
    content_snapshot,
    quantity,
    unit_price,
    total_price,
    item_order,
    remarks_1
  ) values (
    v_line_id,
    'web-custom-order-line-' || v_line_id,
    p_order_id,
    btrim(p_name),
    btrim(p_name),
    p_quantity,
    p_unit_price,
    round(p_quantity * p_unit_price, 2),
    v_item_order,
    nullif(btrim(p_remarks), '')
  );

  perform private.recalculate_quote_total(p_order_id);
  return v_line_id;
end;
$$;

grant execute on function public.add_quote_line(uuid,text,uuid,numeric,numeric,text) to authenticated;
grant execute on function public.add_quote_line(uuid,text,uuid,numeric,numeric,text,jsonb) to authenticated;
grant execute on function public.add_custom_quote_line(uuid,text,numeric,numeric,text) to authenticated;
