-- Fill planned districts from address prefixes. Shopify snapshots often start
-- with 新界/香港仔 rather than a country-prefixed Hong Kong string, so strip
-- region labels without breaking 香港仔, then pick the longest specific district.

with district_canon as (
  select distinct on (lower(btrim(name)))
    id,
    btrim(name) as name
  from public.delivery_districts
  where archived_at is null
    and name is not null
    and btrim(name) <> ''
    and btrim(name) not in ('新界', '九龍', '香港', 'TBC', '按要求')
  order by
    lower(btrim(name)),
    (driver_team_id is null) desc,
    created_at,
    id
),
normalized as (
  select
    orders.id,
    btrim(
      regexp_replace(
        regexp_replace(
          coalesce(orders.shipping_address_snapshot, ''),
          '^\s*（[^）]*）\s*',
          ''
        ),
        '^\s*\([^)]*\)\s*',
        ''
      )
    ) as address
  from public.orders
  where orders.archived_at is null
    and orders.document_type in ('order', 'quote')
    and orders.delivery_district_id is null
    and orders.shipping_address_snapshot is not null
    and btrim(orders.shipping_address_snapshot) <> ''
),
candidates as (
  select
    id,
    case
      when address like '香港新界%' then btrim(substr(address, 5))
      when address like '香港島%' then btrim(substr(address, 4))
      when address like '香港%' and address not like '香港仔%' then btrim(substr(address, 3))
      else address
    end as address
  from normalized
),
stripped as (
  select
    id,
    case
      when address like '新界%' then btrim(substr(address, 3))
      else address
    end as address
  from candidates
),
matched as (
  select distinct on (stripped.id)
    stripped.id,
    district_canon.id as district_id
  from stripped
  join district_canon
    on stripped.address like district_canon.name || '%'
  order by stripped.id, char_length(district_canon.name) desc, district_canon.name
)
update public.orders
set delivery_district_id = matched.district_id,
    updated_at = now()
from matched
where orders.id = matched.id
  and orders.delivery_district_id is null;
