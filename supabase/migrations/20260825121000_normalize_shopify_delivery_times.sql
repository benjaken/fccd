with parsed as (
  select
    id,
    regexp_match(
      upper(translate(btrim(delivery_time), '：–—~至到', ':-----')),
      '^([0-9]{1,2}):([0-5][0-9])[[:space:]]*(AM|PM)[[:space:]]*-[[:space:]]*([0-9]{1,2}):([0-5][0-9])[[:space:]]*(AM|PM)$'
    ) as parts
  from public.orders
  where source_system = 'shopify'
    and delivery_time is not null
)
update public.orders as orders
set delivery_time =
      to_char(to_timestamp(parsed.parts[1] || ':' || parsed.parts[2] || ' ' || parsed.parts[3], 'HH12:MI AM'), 'HH24:MI')
      || ' - ' ||
      to_char(to_timestamp(parsed.parts[4] || ':' || parsed.parts[5] || ' ' || parsed.parts[6], 'HH12:MI AM'), 'HH24:MI'),
    updated_at = now()
from parsed
where orders.id = parsed.id
  and parsed.parts is not null
  and parsed.parts[1]::integer between 1 and 12
  and parsed.parts[4]::integer between 1 and 12;

update public.deliveries as deliveries
set delivery_time = orders.delivery_time,
    updated_at = now()
from public.orders as orders
where deliveries.order_id = orders.id
  and orders.source_system = 'shopify'
  and orders.delivery_time is not null
  and deliveries.delivery_time is distinct from orders.delivery_time;
