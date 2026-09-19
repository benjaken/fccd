-- Self-pick orders were inheriting the Shopify address-based TBC fallback, so the
-- factory board showed 地區 as TBC instead of 自取. Pickup shipping methods carry
-- no address to match, so anchor them on the dedicated 門市自取 district.

insert into public.delivery_districts as district (
  legacy_id,
  name,
  bubble_created_at,
  bubble_modified_at
)
select
  'web-auto-district-門市自取',
  '門市自取',
  now(),
  now()
where not exists (
  select 1
  from public.delivery_districts as existing
  where existing.archived_at is null
    and lower(btrim(existing.name)) = lower('門市自取')
);

with pickup_district as (
  select district.id
  from public.delivery_districts as district
  where district.archived_at is null
    and lower(btrim(district.name)) = lower('門市自取')
  order by
    (district.driver_team_id is null) desc,
    district.created_at,
    district.id
  limit 1
),
pickup_orders as (
  select orders.id
  from public.orders as orders
  join public.shipping_methods as method
    on method.id = orders.shipping_method_id
  left join public.delivery_districts as current_district
    on current_district.id = orders.delivery_district_id
  where orders.archived_at is null
    and orders.document_type = 'order'
    and (
      coalesce(method.requires_address_check, true) = false
      or concat_ws(' ', method.name, method.display_name) ~* '(自取|pickup)'
    )
    and (
      orders.delivery_district_id is null
      or lower(btrim(coalesce(current_district.name, ''))) = 'tbc'
    )
)
update public.orders
set delivery_district_id = pickup_district.id,
    updated_at = now()
from pickup_district, pickup_orders
where orders.id = pickup_orders.id;

with pickup_district as (
  select district.id
  from public.delivery_districts as district
  where district.archived_at is null
    and lower(btrim(district.name)) = lower('門市自取')
  order by
    (district.driver_team_id is null) desc,
    district.created_at,
    district.id
  limit 1
),
pickup_orders as (
  select orders.id
  from public.orders as orders
  join public.shipping_methods as method
    on method.id = orders.shipping_method_id
  where orders.archived_at is null
    and orders.document_type = 'order'
    and (
      coalesce(method.requires_address_check, true) = false
      or concat_ws(' ', method.name, method.display_name) ~* '(自取|pickup)'
    )
)
update public.deliveries as delivery
set district_id = pickup_district.id
from pickup_district, pickup_orders
where delivery.order_id = pickup_orders.id
  and (
    delivery.district_id is null
    or lower(btrim(coalesce((
      select current_district.name
      from public.delivery_districts as current_district
      where current_district.id = delivery.district_id
    ), ''))) = 'tbc'
  );
