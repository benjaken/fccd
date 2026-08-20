-- Central kitchen weekly sales and advertising-cost input page.

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values
  (
    'kitchen.cost_input',
    '費用輸入',
    '/kitchen/cost-input',
    58,
    false,
    'kitchen',
    'subpage'
  ),
  (
    'kitchen.cost_input.edit',
    '新增每週廣告費用',
    '/kitchen/cost-input/actions/edit',
    59,
    true,
    'kitchen.cost_input',
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
    ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'),
    ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
), pages as (
  select page_key
  from public.app_pages
  where page_key in ('kitchen.cost_input', 'kitchen.cost_input.edit')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  pages.page_key,
  roles.role in ('Super Admin', 'Admin', 'Accounting', 'Factory'),
  roles.role = 'Super Admin'
from roles
cross join pages
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();

drop policy if exists "Weekly cost input readers" on public.advertising_costs;
create policy "Weekly cost input readers"
on public.advertising_costs
for select to authenticated
using (private.has_page_access('kitchen.cost_input'));

drop policy if exists "Weekly cost input creators" on public.advertising_costs;
create policy "Weekly cost input creators"
on public.advertising_costs
for insert to authenticated
with check (private.has_page_access('kitchen.cost_input.edit'));

drop policy if exists "Weekly cost input editors" on public.advertising_costs;
create policy "Weekly cost input editors"
on public.advertising_costs
for update to authenticated
using (private.has_page_access('kitchen.cost_input.edit'))
with check (private.has_page_access('kitchen.cost_input.edit'));

drop policy if exists "Weekly cost input deleters" on public.advertising_costs;
create policy "Weekly cost input deleters"
on public.advertising_costs
for delete to authenticated
using (private.has_page_access('kitchen.cost_input.edit'));

-- The same page also owns the non-festival/festival monthly operating-cost tabs.
drop policy if exists "Monthly cost input readers" on public.monthly_costs;
create policy "Monthly cost input readers"
on public.monthly_costs
for select to authenticated
using (private.has_page_access('kitchen.cost_input'));

drop policy if exists "Monthly cost input creators" on public.monthly_costs;
create policy "Monthly cost input creators"
on public.monthly_costs
for insert to authenticated
with check (private.has_page_access('kitchen.cost_input.edit'));

drop policy if exists "Monthly cost input editors" on public.monthly_costs;
create policy "Monthly cost input editors"
on public.monthly_costs
for update to authenticated
using (private.has_page_access('kitchen.cost_input.edit'))
with check (private.has_page_access('kitchen.cost_input.edit'));

drop policy if exists "Monthly cost input deleters" on public.monthly_costs;
create policy "Monthly cost input deleters"
on public.monthly_costs
for delete to authenticated
using (private.has_page_access('kitchen.cost_input.edit'));

drop policy if exists "Monthly cost channel readers" on public.monthly_cost_channels;
create policy "Monthly cost channel readers"
on public.monthly_cost_channels
for select to authenticated
using (private.has_page_access('kitchen.cost_input'));

drop policy if exists "Monthly cost channel creators" on public.monthly_cost_channels;
create policy "Monthly cost channel creators"
on public.monthly_cost_channels
for insert to authenticated
with check (private.has_page_access('kitchen.cost_input.edit'));

drop policy if exists "Monthly cost channel deleters" on public.monthly_cost_channels;
create policy "Monthly cost channel deleters"
on public.monthly_cost_channels
for delete to authenticated
using (private.has_page_access('kitchen.cost_input.edit'));

-- Monthly supplier records are the fourth tab of the same cost-input page.
drop policy if exists "Kitchen cost input supplier purchase readers" on public.supplier_purchases;
create policy "Kitchen cost input supplier purchase readers"
on public.supplier_purchases for select to authenticated
using (private.has_page_access('kitchen.cost_input'));

drop policy if exists "Kitchen cost input supplier purchase creators" on public.supplier_purchases;
create policy "Kitchen cost input supplier purchase creators"
on public.supplier_purchases for insert to authenticated
with check (private.has_page_access('kitchen.cost_input.edit'));

drop policy if exists "Kitchen cost input supplier purchase editors" on public.supplier_purchases;
create policy "Kitchen cost input supplier purchase editors"
on public.supplier_purchases for update to authenticated
using (private.has_page_access('kitchen.cost_input.edit'))
with check (private.has_page_access('kitchen.cost_input.edit'));

drop policy if exists "Kitchen cost input supplier purchase deleters" on public.supplier_purchases;
create policy "Kitchen cost input supplier purchase deleters"
on public.supplier_purchases for delete to authenticated
using (private.has_page_access('kitchen.cost_input.edit'));

drop policy if exists "Kitchen cost input purchase type readers" on public.purchase_types;
create policy "Kitchen cost input purchase type readers"
on public.purchase_types for select to authenticated
using (private.has_page_access('kitchen.cost_input'));

drop policy if exists "Kitchen cost input supplier readers" on public.suppliers;
create policy "Kitchen cost input supplier readers"
on public.suppliers for select to authenticated
using (private.has_page_access('kitchen.cost_input'));

create or replace function public.get_kitchen_supplier_records(
  p_single_date date default null,
  p_start_date date default null,
  p_end_date date default null,
  p_supplier_id uuid default null,
  p_limit integer default 15,
  p_offset integer default 0
)
returns table (
  record_date date,
  supplier_id uuid,
  supplier_legacy_id text,
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
      sp.supplier_id,
      sp.purchase_type_id,
      sum(coalesce(sp.amount, 0)) as amount
    from public.supplier_purchases sp
    where
      (p_supplier_id is null or sp.supplier_id = p_supplier_id)
      and (
        p_single_date is null
        or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date = p_single_date
      )
      and (
        p_single_date is not null
        or p_start_date is null
        or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date >= p_start_date
      )
      and (
        p_single_date is not null
        or p_end_date is null
        or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date <= p_end_date
      )
    group by sp.supplier_id, sp.purchase_type_id
  ), grouped as (
    select
      p_single_date as record_date,
      f.supplier_id,
      s.legacy_id as supplier_legacy_id,
      s.company_name as supplier_name,
      jsonb_agg(
        jsonb_build_object(
          'purchaseTypeId', pt.id,
          'purchaseTypeLegacyId', pt.legacy_id,
          'name', btrim(pt.name),
          'amount', f.amount
        )
        order by pt.bubble_created_at nulls last, pt.name
      ) as category_amounts,
      sum(f.amount) as total_amount
    from filtered f
    join public.suppliers s on s.id = f.supplier_id
    join public.purchase_types pt on pt.id = f.purchase_type_id
    group by f.supplier_id, s.legacy_id, s.company_name
  )
  select
    g.record_date,
    g.supplier_id,
    g.supplier_legacy_id,
    g.supplier_name,
    g.category_amounts,
    g.total_amount,
    count(*) over () as total_count
  from grouped g
  order by g.supplier_name asc
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

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
begin
  select * into strict supplier_row from public.suppliers where id = p_supplier_id;

  if p_original_date is not null and p_original_supplier_id is not null then
    delete from public.supplier_purchases
    where supplier_id = p_original_supplier_id
      and (purchased_at at time zone 'Asia/Hong_Kong')::date = p_original_date;
  end if;

  delete from public.supplier_purchases
  where supplier_id = p_supplier_id
    and (purchased_at at time zone 'Asia/Hong_Kong')::date = p_record_date;

  for amount_row in select value from jsonb_array_elements(p_amounts)
  loop
    select * into strict purchase_type_row
    from public.purchase_types
    where id = (amount_row ->> 'purchaseTypeId')::uuid;

    insert into public.supplier_purchases (
      legacy_id,
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

create or replace function public.delete_kitchen_supplier_record(
  p_record_date date,
  p_supplier_id uuid
)
returns void
language sql
volatile
security invoker
set search_path = public
as $$
  delete from public.supplier_purchases
  where supplier_id = p_supplier_id
    and (purchased_at at time zone 'Asia/Hong_Kong')::date = p_record_date;
$$;

grant execute on function public.get_kitchen_supplier_records(date, date, date, uuid, integer, integer) to authenticated;
grant execute on function public.save_kitchen_supplier_record(date, uuid, jsonb, date, uuid) to authenticated;
grant execute on function public.delete_kitchen_supplier_record(date, uuid) to authenticated;

-- Keep monthly operating-cost sorting and pagination in PostgreSQL. This avoids
-- downloading the full historical table merely to sort one 15-row page.
create index if not exists monthly_costs_non_peak_report_idx
on public.monthly_costs (month_at desc, cost_type_id, bubble_created_at)
where non_peak_amount is not null;

create index if not exists monthly_costs_festival_report_idx
on public.monthly_costs (festival_range_start desc, cost_type_id, bubble_created_at)
where festival_amount is not null;

create index if not exists monthly_cost_channels_monthly_cost_id_idx
on public.monthly_cost_channels (monthly_cost_id);

create or replace function public.get_kitchen_monthly_non_festival_costs(
  p_limit integer default 15,
  p_offset integer default 0
)
returns table (
  id uuid,
  month_at timestamptz,
  amount numeric,
  remarks text,
  cost_type_name text,
  channel_names jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with page_rows as (
    select
      mc.id,
      mc.month_at,
      mc.non_peak_amount as amount,
      mc.remarks,
      coalesce(btrim(ct.name), '—') as cost_type_name,
      mc.primary_channel_id,
      count(*) over () as total_count
    from public.monthly_costs mc
    left join public.cost_types ct on ct.id = mc.cost_type_id
    where mc.non_peak_amount is not null
    order by
      extract(year from mc.month_at at time zone 'Asia/Hong_Kong') desc,
      extract(quarter from mc.month_at at time zone 'Asia/Hong_Kong') desc,
      coalesce(array_position(
        array[
          'shopify', 'electricity', 'rent', 'wages', 'facebook', 'google',
          'water', 'delivery charge', 'packing', 'miscellaneous', 'food cost',
          'marketing'
        ]::text[],
        lower(btrim(ct.name))
      ), 999),
      lower(btrim(ct.name)),
      mc.month_at desc,
      mc.bubble_created_at asc nulls last,
      mc.id
    limit greatest(1, least(coalesce(p_limit, 15), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    pr.id,
    pr.month_at,
    pr.amount,
    pr.remarks,
    pr.cost_type_name,
    coalesce(linked.names, case when primary_channel.name is null then '[]'::jsonb else jsonb_build_array(primary_channel.name) end),
    pr.total_count
  from page_rows pr
  left join public.channels primary_channel on primary_channel.id = pr.primary_channel_id
  left join lateral (
    select jsonb_agg(names.name order by names.sort_order, names.name) as names
    from (
      select distinct channel.name, channel.sort_order
      from public.monthly_cost_channels link
      join public.channels channel on channel.id = link.channel_id
      where link.monthly_cost_id = pr.id
    ) names
  ) linked on true
  order by
    extract(year from pr.month_at at time zone 'Asia/Hong_Kong') desc,
    extract(quarter from pr.month_at at time zone 'Asia/Hong_Kong') desc,
    coalesce(array_position(
      array[
        'shopify', 'electricity', 'rent', 'wages', 'facebook', 'google',
        'water', 'delivery charge', 'packing', 'miscellaneous', 'food cost',
        'marketing'
      ]::text[],
      lower(pr.cost_type_name)
    ), 999),
    lower(pr.cost_type_name),
    pr.month_at desc;
$$;

create or replace function public.get_kitchen_monthly_festival_costs(
  p_limit integer default 15,
  p_offset integer default 0
)
returns table (
  id uuid,
  month_at timestamptz,
  range_start timestamptz,
  range_end timestamptz,
  amount numeric,
  remarks text,
  cost_type_name text,
  festival_name text,
  channel_names jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with page_rows as (
    select
      mc.id,
      mc.month_at,
      mc.festival_range_start as range_start,
      mc.festival_range_end as range_end,
      mc.festival_amount as amount,
      mc.remarks,
      coalesce(btrim(ct.name), '—') as cost_type_name,
      coalesce(btrim(f.name), '—') as festival_name,
      mc.primary_channel_id,
      count(*) over () as total_count
    from public.monthly_costs mc
    left join public.cost_types ct on ct.id = mc.cost_type_id
    left join public.festivals f on f.id = mc.festival_id
    where mc.festival_amount is not null
    order by
      extract(year from coalesce(mc.festival_range_start, mc.month_at) at time zone 'Asia/Hong_Kong') desc,
      extract(quarter from coalesce(mc.festival_range_start, mc.month_at) at time zone 'Asia/Hong_Kong') desc,
      coalesce(array_position(
        array[
          'shopify', 'electricity', 'rent', 'wages', 'facebook', 'google',
          'water', 'delivery charge', 'packing', 'miscellaneous', 'food cost',
          'marketing'
        ]::text[],
        lower(btrim(ct.name))
      ), 999),
      lower(btrim(ct.name)),
      coalesce(mc.festival_range_start, mc.month_at) desc,
      mc.bubble_created_at asc nulls last,
      mc.id
    limit greatest(1, least(coalesce(p_limit, 15), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    pr.id,
    pr.month_at,
    pr.range_start,
    pr.range_end,
    pr.amount,
    pr.remarks,
    pr.cost_type_name,
    pr.festival_name,
    coalesce(linked.names, case when primary_channel.name is null then '[]'::jsonb else jsonb_build_array(primary_channel.name) end),
    pr.total_count
  from page_rows pr
  left join public.channels primary_channel on primary_channel.id = pr.primary_channel_id
  left join lateral (
    select jsonb_agg(names.name order by names.sort_order, names.name) as names
    from (
      select distinct channel.name, channel.sort_order
      from public.monthly_cost_channels link
      join public.channels channel on channel.id = link.channel_id
      where link.monthly_cost_id = pr.id
    ) names
  ) linked on true
  order by
    extract(year from coalesce(pr.range_start, pr.month_at) at time zone 'Asia/Hong_Kong') desc,
    extract(quarter from coalesce(pr.range_start, pr.month_at) at time zone 'Asia/Hong_Kong') desc,
    coalesce(array_position(
      array[
        'shopify', 'electricity', 'rent', 'wages', 'facebook', 'google',
        'water', 'delivery charge', 'packing', 'miscellaneous', 'food cost',
        'marketing'
      ]::text[],
      lower(pr.cost_type_name)
    ), 999),
    lower(pr.cost_type_name),
    coalesce(pr.range_start, pr.month_at) desc;
$$;

grant execute on function public.get_kitchen_monthly_non_festival_costs(integer, integer) to authenticated;
grant execute on function public.get_kitchen_monthly_festival_costs(integer, integer) to authenticated;

create index if not exists supplier_purchases_report_filter_idx
on public.supplier_purchases (
  ((purchased_at at time zone 'Asia/Hong_Kong')::date) desc,
  supplier_id,
  purchase_type_id
);

create or replace function public.get_kitchen_supplier_cost_entries(
  p_single_date date default null,
  p_start_date date default null,
  p_end_date date default null,
  p_supplier_id uuid default null,
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
    sp.id,
    (sp.purchased_at at time zone 'Asia/Hong_Kong')::date as record_date,
    sp.supplier_id,
    s.company_name as supplier_name,
    sp.purchase_type_id,
    btrim(pt.name) as purchase_type_name,
    coalesce(sp.amount, 0) as amount,
    count(*) over () as total_count
  from public.supplier_purchases sp
  join public.suppliers s on s.id = sp.supplier_id
  join public.purchase_types pt on pt.id = sp.purchase_type_id
  where
    (p_supplier_id is null or sp.supplier_id = p_supplier_id)
    and (
      p_single_date is null
      or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date = p_single_date
    )
    and (
      p_single_date is not null
      or p_start_date is null
      or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date >= p_start_date
    )
    and (
      p_single_date is not null
      or p_end_date is null
      or (sp.purchased_at at time zone 'Asia/Hong_Kong')::date <= p_end_date
    )
  order by
    (sp.purchased_at at time zone 'Asia/Hong_Kong')::date desc,
    s.company_name asc,
    pt.bubble_created_at asc nulls last,
    sp.bubble_created_at asc nulls last,
    sp.id
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_kitchen_supplier_cost_entries(date, date, date, uuid, integer, integer) to authenticated;
