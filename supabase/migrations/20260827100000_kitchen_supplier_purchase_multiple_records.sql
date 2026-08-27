-- Keep every central-kitchen supplier purchase submission as an independent
-- record and keep zero-valued placeholders out of the expense editor.
alter table public.supplier_purchases
  add column if not exists purchase_record_id uuid;

create index if not exists supplier_purchases_purchase_record_id_idx
  on public.supplier_purchases (purchase_record_id)
  where purchase_record_id is not null;

-- Imported rows do not have an invoice identifier. Treat each historical
-- Hong Kong date / supplier tuple as one legacy purchase record.
with legacy_groups as (
  select
    (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date as record_date,
    purchase.supplier_id,
    gen_random_uuid() as purchase_record_id
  from public.supplier_purchases purchase
  where purchase.purchase_record_id is null
  group by
    (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date,
    purchase.supplier_id
)
update public.supplier_purchases purchase
set purchase_record_id = legacy_groups.purchase_record_id
from legacy_groups
where purchase.purchase_record_id is null
  and (purchase.purchased_at at time zone 'Asia/Hong_Kong')::date is not distinct from legacy_groups.record_date
  and purchase.supplier_id is not distinct from legacy_groups.supplier_id;

create or replace function public.save_kitchen_supplier_record(
  p_record_date date,
  p_supplier_id uuid,
  p_amounts jsonb,
  p_original_date date default null,
  p_original_supplier_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  supplier_row public.suppliers%rowtype;
  amount_row jsonb;
  purchase_type_row public.purchase_types%rowtype;
  now_value timestamptz := now();
  record_group_id uuid := gen_random_uuid();
  amount_value numeric;
begin
  select * into strict supplier_row
  from public.suppliers
  where id = p_supplier_id;

  -- Retain compatibility with older clients that can replace ungrouped rows.
  -- New web submissions are always appended as their own record group.
  if p_original_date is not null and p_original_supplier_id is not null then
    delete from public.supplier_purchases
    where supplier_id = p_original_supplier_id
      and purchase_record_id is null
      and (purchased_at at time zone 'Asia/Hong_Kong')::date = p_original_date;
  end if;

  for amount_row in select value from jsonb_array_elements(coalesce(p_amounts, '[]'::jsonb))
  loop
    amount_value := greatest(coalesce((amount_row ->> 'amount')::numeric, 0), 0);
    if amount_value <= 0 then
      continue;
    end if;

    select * into strict purchase_type_row
    from public.purchase_types
    where id = (amount_row ->> 'purchaseTypeId')::uuid;

    insert into public.supplier_purchases (
      legacy_id,
      purchase_record_id,
      supplier_id,
      supplier_legacy_id,
      purchase_type_id,
      purchase_type_legacy_id,
      purchased_at,
      amount,
      bubble_created_at,
      bubble_modified_at
    ) values (
      'web-supplier-purchase-' || gen_random_uuid()::text,
      record_group_id,
      supplier_row.id,
      supplier_row.legacy_id,
      purchase_type_row.id,
      purchase_type_row.legacy_id,
      p_record_date::timestamp at time zone 'Asia/Hong_Kong',
      amount_value,
      now_value,
      now_value
    );
  end loop;
end;
$$;

create or replace function public.get_kitchen_supplier_cost_entries(
  p_single_date date default null,
  p_start_date date default null,
  p_end_date date default null,
  p_supplier_ids uuid[] default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  record_date date,
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
    purchase.supplier_id,
    supplier.company_name as supplier_name,
    purchase.purchase_type_id,
    btrim(purchase_type.name) as purchase_type_name,
    coalesce(purchase.amount, 0) as amount,
    count(*) over () as total_count
  from public.supplier_purchases purchase
  join public.suppliers supplier on supplier.id = purchase.supplier_id
  join public.purchase_types purchase_type on purchase_type.id = purchase.purchase_type_id
  where
    coalesce(purchase.amount, 0) > 0
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
    supplier.company_name,
    purchase.purchase_record_id nulls first,
    purchase_type.bubble_created_at nulls last,
    purchase.bubble_created_at nulls last,
    purchase.id
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.update_kitchen_supplier_cost_entry(
  p_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(p_amount, 0) <= 0 then
    delete from public.supplier_purchases where id = p_id;
  else
    update public.supplier_purchases
    set amount = p_amount,
        bubble_modified_at = now()
    where id = p_id;
  end if;
end;
$$;

grant execute on function public.save_kitchen_supplier_record(date, uuid, jsonb, date, uuid) to authenticated;
grant execute on function public.get_kitchen_supplier_cost_entries(date, date, date, uuid[], integer, integer) to authenticated;
grant execute on function public.update_kitchen_supplier_cost_entry(uuid, numeric) to authenticated;
