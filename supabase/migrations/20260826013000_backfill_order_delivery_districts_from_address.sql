-- Restore planned districts for orders/quotes that never received a delivery
-- row. Hong Kong addresses usually start with the district name; match the
-- longest active district so "九龍灣" wins over "九龍".

with district_canon as (
  select distinct on (lower(btrim(name)))
    id,
    btrim(name) as name
  from public.delivery_districts
  where archived_at is null
    and name is not null
    and btrim(name) <> ''
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
    normalized.id,
    case
      when normalized.address like '香港新界%' then btrim(substr(normalized.address, 5))
      when normalized.address like '香港%' then btrim(substr(normalized.address, 3))
      else normalized.address
    end as address
  from normalized
),
matched as (
  select distinct on (candidates.id)
    candidates.id,
    district_canon.id as district_id
  from candidates
  join district_canon
    on candidates.address like district_canon.name || '%'
  order by candidates.id, char_length(district_canon.name) desc, district_canon.name
)
update public.orders
set delivery_district_id = matched.district_id,
    updated_at = now()
from matched
where orders.id = matched.id
  and orders.delivery_district_id is null;
