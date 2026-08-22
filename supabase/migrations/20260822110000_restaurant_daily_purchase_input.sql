-- Restaurant daily purchase input, modeled after the central-kitchen monthly
-- supplier record while preserving the restaurant dimension.
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
  ('restaurant.daily_purchases', '每日採購單輸入', '/restaurant/daily-purchases', 63, false, 'restaurant', 'subpage'),
  ('restaurant.daily_purchases.edit', '新增及編輯每日採購單', '/restaurant/daily-purchases/actions/edit', 64, true, 'restaurant.daily_purchases', 'action')
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
), pages(page_key) as (
  values ('restaurant.daily_purchases'), ('restaurant.daily_purchases.edit')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  pages.page_key,
  case
    when pages.page_key = 'restaurant.daily_purchases'
      then roles.role in ('Super Admin', 'Admin', 'Accounting', 'Shop manager')
    else roles.role in ('Super Admin', 'Admin', 'Shop manager')
  end,
  roles.role = 'Super Admin'
from roles cross join pages
on conflict (role, page_key) do update
set
  can_access = public.role_page_permissions.can_access or excluded.can_access,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

drop policy if exists "Daily purchase input restaurant readers" on public.restaurants;
create policy "Daily purchase input restaurant readers"
  on public.restaurants for select to authenticated
  using (private.has_page_access('restaurant.daily_purchases'));

drop policy if exists "Daily purchase input supplier readers" on public.suppliers;
create policy "Daily purchase input supplier readers"
  on public.suppliers for select to authenticated
  using (private.has_page_access('restaurant.daily_purchases'));

drop policy if exists "Daily purchase input category readers" on public.restaurant_purchase_types;
create policy "Daily purchase input category readers"
  on public.restaurant_purchase_types for select to authenticated
  using (private.has_page_access('restaurant.daily_purchases'));

drop policy if exists "Daily purchase input readers" on public.restaurant_supplier_purchases;
create policy "Daily purchase input readers"
  on public.restaurant_supplier_purchases for select to authenticated
  using (private.has_page_access('restaurant.daily_purchases'));

drop policy if exists "Daily purchase input inserts" on public.restaurant_supplier_purchases;
create policy "Daily purchase input inserts"
  on public.restaurant_supplier_purchases for insert to authenticated
  with check (private.has_page_access('restaurant.daily_purchases.edit'));

drop policy if exists "Daily purchase input updates" on public.restaurant_supplier_purchases;
create policy "Daily purchase input updates"
  on public.restaurant_supplier_purchases for update to authenticated
  using (private.has_page_access('restaurant.daily_purchases.edit'))
  with check (private.has_page_access('restaurant.daily_purchases.edit'));

drop policy if exists "Daily purchase input deletes" on public.restaurant_supplier_purchases;
create policy "Daily purchase input deletes"
  on public.restaurant_supplier_purchases for delete to authenticated
  using (private.has_page_access('restaurant.daily_purchases.edit'));

create index if not exists restaurant_supplier_purchases_report_filter_idx
on public.restaurant_supplier_purchases (
  ((purchased_at at time zone 'Asia/Hong_Kong')::date) desc,
  restaurant_id,
  supplier_id,
  purchase_type_id
);

create or replace function public.get_restaurant_daily_purchase_records(
  p_single_date date default null,
  p_start_date date default null,
  p_end_date date default null,
  p_restaurant_ids uuid[] default null,
  p_supplier_ids uuid[] default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  record_date date,
  restaurant_id uuid,
  restaurant_name text,
  supplier_id uuid,
  supplier_name text,
  category_amounts jsonb,
  total_amount numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select
      purchase.restaurant_id,
      purchase.supplier_id,
      purchase.purchase_type_id,
      sum(coalesce(purchase.amount, 0)) as amount
    from public.restaurant_supplier_purchases purchase
    where
      (coalesce(cardinality(p_restaurant_ids), 0) = 0 or purchase.restaurant_id = any(p_restaurant_ids))
      and (coalesce(cardinality(p_supplier_ids), 0) = 0 or purchase.supplier_id = any(p_supplier_ids))
      and (
        p_single_date is null
        or (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date = p_single_date
      )
      and (
        p_single_date is not null
        or p_start_date is null
        or (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date >= p_start_date
      )
      and (
        p_single_date is not null
        or p_end_date is null
        or (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date <= p_end_date
      )
    group by purchase.restaurant_id, purchase.supplier_id, purchase.purchase_type_id
  ), grouped as (
    select
      p_single_date as record_date,
      filtered.restaurant_id,
      restaurant.name as restaurant_name,
      filtered.supplier_id,
      supplier.company_name as supplier_name,
      jsonb_agg(
        jsonb_build_object(
          'purchaseTypeId', purchase_type.id,
          'purchaseTypeLegacyId', purchase_type.legacy_id,
          'name', btrim(purchase_type.name),
          'amount', filtered.amount
        )
        order by purchase_type.sort_order nulls last,
          purchase_type.bubble_created_at nulls last,
          purchase_type.name
      ) as category_amounts,
      sum(filtered.amount) as total_amount
    from filtered
    join public.restaurants restaurant on restaurant.id = filtered.restaurant_id
    join public.suppliers supplier on supplier.id = filtered.supplier_id
    join public.restaurant_purchase_types purchase_type on purchase_type.id = filtered.purchase_type_id
    group by
      filtered.restaurant_id,
      restaurant.name,
      filtered.supplier_id,
      supplier.company_name
  )
  select
    grouped.record_date,
    grouped.restaurant_id,
    grouped.restaurant_name,
    grouped.supplier_id,
    grouped.supplier_name,
    grouped.category_amounts,
    grouped.total_amount,
    count(*) over () as total_count
  from grouped
  order by grouped.restaurant_name, grouped.supplier_name
  limit greatest(1, least(coalesce(p_limit, 100), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.save_restaurant_daily_purchase_record(
  p_record_date date,
  p_restaurant_id uuid,
  p_supplier_id uuid,
  p_amounts jsonb,
  p_original_date date default null,
  p_original_restaurant_id uuid default null,
  p_original_supplier_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  restaurant_row public.restaurants%rowtype;
  supplier_row public.suppliers%rowtype;
  purchase_type_row public.restaurant_purchase_types%rowtype;
  amount_row jsonb;
  now_value timestamptz := now();
begin
  select * into strict restaurant_row from public.restaurants where id = p_restaurant_id;
  select * into strict supplier_row from public.suppliers where id = p_supplier_id;

  if p_original_date is not null
    and p_original_restaurant_id is not null
    and p_original_supplier_id is not null then
    delete from public.restaurant_supplier_purchases
    where restaurant_id = p_original_restaurant_id
      and supplier_id = p_original_supplier_id
      and (purchased_at at time zone 'Asia/Hong_Kong')::date = p_original_date;
  end if;

  delete from public.restaurant_supplier_purchases
  where restaurant_id = p_restaurant_id
    and supplier_id = p_supplier_id
    and (purchased_at at time zone 'Asia/Hong_Kong')::date = p_record_date;

  for amount_row in select value from jsonb_array_elements(p_amounts)
  loop
    select * into strict purchase_type_row
    from public.restaurant_purchase_types
    where id = (amount_row ->> 'purchaseTypeId')::uuid;

    insert into public.restaurant_supplier_purchases (
      legacy_id,
      restaurant_id,
      restaurant_legacy_id,
      supplier_id,
      supplier_legacy_id,
      purchase_type_id,
      purchase_type_legacy_id,
      purchased_at,
      amount,
      bubble_created_at,
      bubble_modified_at
    ) values (
      'web-restaurant-supplier-purchase-' || gen_random_uuid()::text,
      restaurant_row.id,
      restaurant_row.legacy_id,
      supplier_row.id,
      supplier_row.legacy_id,
      purchase_type_row.id,
      purchase_type_row.legacy_id,
      p_record_date::timestamp at time zone 'Asia/Hong_Kong',
      greatest(coalesce((amount_row ->> 'amount')::numeric, 0), 0),
      now_value,
      now_value
    );
  end loop;
end;
$$;

create or replace function public.get_restaurant_daily_purchase_entries(
  p_single_date date default null,
  p_start_date date default null,
  p_end_date date default null,
  p_restaurant_ids uuid[] default null,
  p_supplier_ids uuid[] default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  record_date date,
  restaurant_id uuid,
  restaurant_name text,
  supplier_id uuid,
  supplier_name text,
  purchase_type_id uuid,
  purchase_type_name text,
  amount numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    purchase.id,
    (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date as record_date,
    purchase.restaurant_id,
    restaurant.name as restaurant_name,
    purchase.supplier_id,
    supplier.company_name as supplier_name,
    purchase.purchase_type_id,
    btrim(purchase_type.name) as purchase_type_name,
    coalesce(purchase.amount, 0) as amount,
    count(*) over () as total_count
  from public.restaurant_supplier_purchases purchase
  join public.restaurants restaurant on restaurant.id = purchase.restaurant_id
  join public.suppliers supplier on supplier.id = purchase.supplier_id
  join public.restaurant_purchase_types purchase_type on purchase_type.id = purchase.purchase_type_id
  where
    (coalesce(cardinality(p_restaurant_ids), 0) = 0 or purchase.restaurant_id = any(p_restaurant_ids))
    and (coalesce(cardinality(p_supplier_ids), 0) = 0 or purchase.supplier_id = any(p_supplier_ids))
    and (
      p_single_date is null
      or (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date = p_single_date
    )
    and (
      p_single_date is not null
      or p_start_date is null
      or (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date >= p_start_date
    )
    and (
      p_single_date is not null
      or p_end_date is null
      or (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date <= p_end_date
    )
  order by
    (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date desc,
    restaurant.name,
    supplier.company_name,
    purchase_type.sort_order nulls last,
    purchase_type.bubble_created_at nulls last,
    purchase.id
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_restaurant_daily_purchase_records(date, date, date, uuid[], uuid[], integer, integer) to authenticated;
grant execute on function public.save_restaurant_daily_purchase_record(date, uuid, uuid, jsonb, date, uuid, uuid) to authenticated;
grant execute on function public.get_restaurant_daily_purchase_entries(date, date, date, uuid[], uuid[], integer, integer) to authenticated;
