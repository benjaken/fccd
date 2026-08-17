-- Replace automatic monthly-price refresh with a permissioned push button
-- on 售價成本計算. The Bubble flow only ran after a month was chosen.

drop trigger if exists refresh_monthly_meat_prices_raw_stock
  on public.raw_meat_stock_movements;
drop trigger if exists refresh_monthly_meat_prices_prepared_source
  on public.prepared_meat_stock_raw_sources;
drop trigger if exists refresh_monthly_meat_prices_prepared_inbound
  on public.prepared_meat_stock_movements;

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
    'frozen.selling_price_cost.push',
    '推送月報售價',
    '/frozen/selling-price-cost/actions/push',
    64,
    true,
    'frozen.selling_price_cost',
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
  'frozen.selling_price_cost.push',
  roles.role = 'Super Admin',
  roles.role = 'Super Admin'
from roles
on conflict (role, page_key) do nothing;

create or replace function public.push_monthly_meat_prices(
  p_raw_meat_item_id uuid,
  p_year_month text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_at timestamptz;
begin
  if not private.has_page_access('frozen.selling_price_cost.push') then
    raise exception 'not authorized to push monthly meat prices'
      using errcode = '42501';
  end if;

  if p_raw_meat_item_id is null then
    raise exception 'raw meat item is required'
      using errcode = '22023';
  end if;

  if p_year_month is null or p_year_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'year month is required'
      using errcode = '22023';
  end if;

  v_month_at :=
    ((p_year_month || '-01')::timestamp at time zone 'Asia/Hong_Kong');

  return private.refresh_monthly_meat_prices(p_raw_meat_item_id, v_month_at);
end;
$$;

revoke all on function public.push_monthly_meat_prices(uuid, text)
  from public, anon;
grant execute on function public.push_monthly_meat_prices(uuid, text)
  to authenticated;

comment on function public.push_monthly_meat_prices(uuid, text) is
  'Pushes shop/factory monthly meat prices for one raw meat and HKT YYYY-MM. Requires frozen.selling_price_cost.push.';
