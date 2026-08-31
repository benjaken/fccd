-- Bubble synchronization can set is_sent_to_factory directly instead of using
-- set_order_factory_status(). Keep the delivery-backed factory board
-- consistent at the database boundary for both paths.

create or replace function private.ensure_factory_delivery_for_sent_order()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_delivery_id uuid;
begin
  if new.document_type is distinct from 'order'
    or new.archived_at is not null
    or new.is_sent_to_factory is distinct from true
  then
    return new;
  end if;

  -- A newly imported Bubble order receives its resolved district in the
  -- metadata pass. The trigger also watches that column, so wait for the
  -- minimum delivery fields instead of creating an unusable partial row.
  if new.delivery_district_id is null
    or new.shipping_method_id is null
    or new.delivery_at is null
  then
    return new;
  end if;

  if exists (
    select 1
    from public.deliveries delivery
    where delivery.order_id = new.id
  ) then
    return new;
  end if;

  v_delivery_id := gen_random_uuid();
  insert into public.deliveries (
    id,
    legacy_id,
    order_id,
    order_legacy_id,
    district_id,
    shipping_method_id,
    shipping_method_legacy_id,
    delivery_at,
    delivery_time,
    ship_out_time,
    delivery_status,
    total_fee
  ) values (
    v_delivery_id,
    'factory-send-delivery-' || new.id,
    new.id,
    new.legacy_id,
    new.delivery_district_id,
    new.shipping_method_id,
    new.shipping_method_legacy_id,
    new.delivery_at,
    new.delivery_time,
    new.ship_out_time,
    coalesce(new.delivery_status, '未派車隊'),
    new.shipping_fee
  )
  on conflict (legacy_id) do nothing;

  return new;
end;
$$;

drop trigger if exists ensure_factory_delivery_for_sent_order
  on public.orders;
create trigger ensure_factory_delivery_for_sent_order
after update of is_sent_to_factory, delivery_district_id,
  shipping_method_id, delivery_at
on public.orders
for each row execute function private.ensure_factory_delivery_for_sent_order();

-- Repair any other synchronized orders already left in the same inconsistent
-- state. The three reported B-1550 child orders are already safe because the
-- normal factory-status RPC was rerun before this migration.
insert into public.deliveries (
  id,
  legacy_id,
  order_id,
  order_legacy_id,
  district_id,
  shipping_method_id,
  shipping_method_legacy_id,
  delivery_at,
  delivery_time,
  ship_out_time,
  delivery_status,
  total_fee
)
select
  gen_random_uuid(),
  'factory-send-delivery-' || orders.id,
  orders.id,
  orders.legacy_id,
  orders.delivery_district_id,
  orders.shipping_method_id,
  orders.shipping_method_legacy_id,
  orders.delivery_at,
  orders.delivery_time,
  orders.ship_out_time,
  coalesce(orders.delivery_status, '未派車隊'),
  orders.shipping_fee
from public.orders orders
where orders.document_type = 'order'
  and orders.archived_at is null
  and orders.is_sent_to_factory is true
  and orders.delivery_district_id is not null
  and orders.shipping_method_id is not null
  and orders.delivery_at is not null
  and not exists (
    select 1
    from public.deliveries delivery
    where delivery.order_id = orders.id
  )
on conflict (legacy_id) do nothing;

comment on function private.ensure_factory_delivery_for_sent_order() is
  'Ensures direct Bubble factory-status synchronization cannot leave a sent order missing from the delivery-backed factory board.';
