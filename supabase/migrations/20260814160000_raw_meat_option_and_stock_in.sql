-- Create/edit raw meat options (with suppliers) and inbound stock movements.
-- Super Admin only for now via action permissions.

do $$
begin
  if not exists (
    select 1
    from public.app_pages
    where page_key = 'frozen.raw_meat_inventory.create'
  ) then
    update public.app_pages
    set sort_order = sort_order + 3, updated_at = now()
    where sort_order >= 47;
  end if;
end;
$$;

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
    'frozen.raw_meat_inventory.create',
    '新建生肉選項',
    '/frozen/raw-meat-inventory/actions/create',
    47,
    true,
    'frozen.raw_meat_inventory',
    'action'
  ),
  (
    'frozen.raw_meat_inventory.edit',
    '編輯生肉選項',
    '/frozen/raw-meat-inventory/actions/edit',
    48,
    true,
    'frozen.raw_meat_inventory',
    'action'
  ),
  (
    'frozen.raw_meat_inventory.stock_in',
    '生肉入貨',
    '/frozen/raw-meat-inventory/actions/stock-in',
    49,
    true,
    'frozen.raw_meat_inventory',
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
    ('frozen.raw_meat_inventory.create'),
    ('frozen.raw_meat_inventory.edit'),
    ('frozen.raw_meat_inventory.stock_in')
) as pages(page_key)
on conflict (role, page_key) do nothing;

create or replace function private.replace_raw_meat_item_suppliers(
  p_item_id uuid,
  p_supplier_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_legacy text;
  v_ids uuid[];
  v_linked integer;
begin
  select legacy_id
  into v_item_legacy
  from public.raw_meat_items
  where id = p_item_id
    and archived_at is null;

  if v_item_legacy is null then
    raise exception 'raw meat item not found'
      using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct supplier_id), '{}')
  into v_ids
  from unnest(coalesce(p_supplier_ids, '{}')) as supplier_id;

  delete from public.raw_meat_item_suppliers
  where raw_meat_item_id = p_item_id
    and not (supplier_id = any (v_ids));

  insert into public.raw_meat_item_suppliers (
    raw_meat_item_id,
    raw_meat_item_legacy_id,
    supplier_id,
    supplier_legacy_id
  )
  select
    p_item_id,
    v_item_legacy,
    supplier.id,
    supplier.legacy_id
  from public.suppliers as supplier
  where supplier.id = any (v_ids)
    and supplier.archived_at is null
  on conflict (raw_meat_item_id, supplier_id) do nothing;

  select count(*)
  into v_linked
  from public.raw_meat_item_suppliers
  where raw_meat_item_id = p_item_id
    and supplier_id = any (v_ids);

  if coalesce(array_length(v_ids, 1), 0) <> v_linked then
    raise exception 'one or more suppliers were not found'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.replace_raw_meat_item_suppliers(uuid, uuid[])
  from public, anon, authenticated;

create or replace function public.create_raw_meat_item(
  p_sku text,
  p_name text,
  p_english_name text,
  p_supplier_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_next_sort numeric;
begin
  if not private.has_page_access('frozen.raw_meat_inventory.create') then
    raise exception 'not authorized to create raw meat options'
      using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'raw meat name is required'
      using errcode = '22023';
  end if;

  select coalesce(max(sort_order), 0) + 1
  into v_next_sort
  from public.raw_meat_items
  where archived_at is null;

  insert into public.raw_meat_items (
    legacy_id,
    sku,
    name,
    english_name,
    unit,
    sort_order,
    can_ship_directly,
    is_active,
    bubble_created_at,
    bubble_modified_at
  )
  values (
    'web-raw-meat-' || gen_random_uuid()::text,
    nullif(btrim(coalesce(p_sku, '')), ''),
    v_name,
    nullif(btrim(coalesce(p_english_name, '')), ''),
    'kg',
    v_next_sort,
    false,
    true,
    now(),
    now()
  )
  returning id into v_id;

  perform private.replace_raw_meat_item_suppliers(v_id, p_supplier_ids);
  return v_id;
end;
$$;

create or replace function public.update_raw_meat_item(
  p_item_id uuid,
  p_sku text,
  p_name text,
  p_english_name text,
  p_supplier_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not private.has_page_access('frozen.raw_meat_inventory.edit') then
    raise exception 'not authorized to edit raw meat options'
      using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'raw meat name is required'
      using errcode = '22023';
  end if;

  update public.raw_meat_items
  set
    sku = nullif(btrim(coalesce(p_sku, '')), ''),
    name = v_name,
    english_name = nullif(btrim(coalesce(p_english_name, '')), ''),
    bubble_modified_at = now(),
    updated_at = now()
  where id = p_item_id
    and archived_at is null;

  if not found then
    raise exception 'raw meat item not found'
      using errcode = 'P0002';
  end if;

  perform private.replace_raw_meat_item_suppliers(p_item_id, p_supplier_ids);
  return p_item_id;
end;
$$;

create or replace function public.create_raw_meat_stock_in(
  p_item_id uuid,
  p_supplier_id uuid,
  p_movement_date date,
  p_unit text,
  p_unit_price numeric,
  p_quantity numeric,
  p_remarks text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.raw_meat_items%rowtype;
  v_supplier public.suppliers%rowtype;
  v_multiplier numeric;
  v_quantity_kg numeric(14, 3);
  v_unit_price_kg numeric(14, 4);
  v_total numeric(14, 2);
  v_id uuid;
begin
  if not private.has_page_access('frozen.raw_meat_inventory.stock_in') then
    raise exception 'not authorized to record raw meat stock in'
      using errcode = '42501';
  end if;

  if p_movement_date is null then
    raise exception 'movement date is required'
      using errcode = '22023';
  end if;

  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'unit price must be zero or greater'
      using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than zero'
      using errcode = '22023';
  end if;

  select *
  into v_item
  from public.raw_meat_items
  where id = p_item_id
    and archived_at is null;

  if not found then
    raise exception 'raw meat item not found'
      using errcode = 'P0002';
  end if;

  select *
  into v_supplier
  from public.suppliers
  where id = p_supplier_id
    and archived_at is null;

  if not found then
    raise exception 'supplier not found'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.raw_meat_item_suppliers
    where raw_meat_item_id = p_item_id
      and supplier_id = p_supplier_id
  ) then
    raise exception 'supplier is not assigned to this raw meat option'
      using errcode = '42501';
  end if;

  select multiplier
  into v_multiplier
  from public.meat_unit_conversions
  where unit = p_unit
  limit 1;

  if v_multiplier is null or v_multiplier = 0 then
    raise exception 'unknown weight unit'
      using errcode = '22023';
  end if;

  v_quantity_kg := round(p_quantity / v_multiplier, 3);
  v_unit_price_kg := round(p_unit_price * v_multiplier, 4);
  v_total := round(p_unit_price * p_quantity, 2);

  insert into public.raw_meat_stock_movements (
    legacy_id,
    raw_meat_item_id,
    raw_meat_item_legacy_id,
    supplier_id,
    supplier_legacy_id,
    movement_at,
    inbound_quantity_kg,
    inbound_unit_price,
    inbound_total_amount,
    applied_seasoning_cost,
    applied_seasoning_code,
    applied_markup_rate,
    applied_variation_rate,
    remarks,
    bubble_created_at,
    bubble_modified_at
  )
  values (
    'web-raw-stock-' || gen_random_uuid()::text,
    v_item.id,
    v_item.legacy_id,
    v_supplier.id,
    v_supplier.legacy_id,
    (p_movement_date::timestamp AT TIME ZONE 'Asia/Hong_Kong'),
    v_quantity_kg,
    v_unit_price_kg,
    v_total,
    v_item.current_seasoning_cost,
    v_item.current_seasoning_code,
    v_item.current_markup_rate,
    v_item.current_variation_rate,
    nullif(btrim(coalesce(p_remarks, '')), ''),
    now(),
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_raw_meat_item(text, text, text, uuid[])
  from public, anon;
grant execute on function public.create_raw_meat_item(text, text, text, uuid[])
  to authenticated;

revoke all on function public.update_raw_meat_item(uuid, text, text, text, uuid[])
  from public, anon;
grant execute on function public.update_raw_meat_item(uuid, text, text, text, uuid[])
  to authenticated;

revoke all on function public.create_raw_meat_stock_in(
  uuid, uuid, date, text, numeric, numeric, text
) from public, anon;
grant execute on function public.create_raw_meat_stock_in(
  uuid, uuid, date, text, numeric, numeric, text
) to authenticated;

drop policy if exists "Administrators insert raw_meat_items" on public.raw_meat_items;
create policy "Raw meat option creators insert items"
on public.raw_meat_items
for insert to authenticated
with check (private.has_page_access('frozen.raw_meat_inventory.create'));

drop policy if exists "Administrators update raw_meat_items" on public.raw_meat_items;
create policy "Raw meat option editors update items"
on public.raw_meat_items
for update to authenticated
using (private.has_page_access('frozen.raw_meat_inventory.edit'))
with check (private.has_page_access('frozen.raw_meat_inventory.edit'));

drop policy if exists "Administrators insert raw_meat_item_suppliers"
  on public.raw_meat_item_suppliers;
drop policy if exists "Administrators update raw_meat_item_suppliers"
  on public.raw_meat_item_suppliers;
drop policy if exists "Administrators delete raw_meat_item_suppliers"
  on public.raw_meat_item_suppliers;

create policy "Raw meat option writers insert suppliers"
on public.raw_meat_item_suppliers
for insert to authenticated
with check (
  private.has_page_access('frozen.raw_meat_inventory.create')
  or private.has_page_access('frozen.raw_meat_inventory.edit')
);

create policy "Raw meat option writers update suppliers"
on public.raw_meat_item_suppliers
for update to authenticated
using (
  private.has_page_access('frozen.raw_meat_inventory.create')
  or private.has_page_access('frozen.raw_meat_inventory.edit')
)
with check (
  private.has_page_access('frozen.raw_meat_inventory.create')
  or private.has_page_access('frozen.raw_meat_inventory.edit')
);

create policy "Raw meat option writers delete suppliers"
on public.raw_meat_item_suppliers
for delete to authenticated
using (
  private.has_page_access('frozen.raw_meat_inventory.create')
  or private.has_page_access('frozen.raw_meat_inventory.edit')
);

drop policy if exists "Administrators insert raw_meat_stock_movements"
  on public.raw_meat_stock_movements;
create policy "Raw meat stock-in writers insert movements"
on public.raw_meat_stock_movements
for insert to authenticated
with check (private.has_page_access('frozen.raw_meat_inventory.stock_in'));
