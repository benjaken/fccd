-- Backfill known Shopify district aliases, then use TBC as the final fallback
-- so imported Shopify orders never leave the planned district empty.

with aliases(prefix, district_name) as (
  values
    ('kowloon bay', '九龍灣'),
    ('lohas park', '將軍澳'),
    ('日出康城', '將軍澳')
), district_canon as (
  select distinct on (lower(btrim(name)))
    id,
    lower(btrim(name)) as normalized_name
  from public.delivery_districts
  where archived_at is null
  order by
    lower(btrim(name)),
    (driver_team_id is null) desc,
    created_at,
    id
), matched as (
  select distinct on (orders.id)
    orders.id,
    district_canon.id as district_id
  from public.orders orders
  join aliases
    on lower(btrim(coalesce(orders.shipping_address_snapshot, '')))
      like lower(aliases.prefix) || '%'
  join district_canon
    on district_canon.normalized_name = lower(aliases.district_name)
  where orders.delivery_district_id is null
    and orders.archived_at is null
    and orders.source_system = 'shopify'
  order by orders.id, char_length(aliases.prefix) desc
)
update public.orders
set delivery_district_id = matched.district_id,
    updated_at = now()
from matched
where orders.id = matched.id
  and orders.delivery_district_id is null;

with fallback as (
  select id
  from public.delivery_districts
  where archived_at is null
    and lower(btrim(name)) = 'tbc'
  order by
    (driver_team_id is null) desc,
    created_at,
    id
  limit 1
)
update public.orders
set delivery_district_id = fallback.id,
    updated_at = now()
from fallback
where orders.delivery_district_id is null
  and orders.archived_at is null
  and orders.source_system = 'shopify';
