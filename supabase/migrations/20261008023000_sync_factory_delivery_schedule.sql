-- The factory board reads deliveries.delivery_at. Changing a sent order's
-- delivery date (or sending it to the factory again) used to leave the existing
-- delivery on the old day, so the order disappeared from the new factory date.

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

  select delivery.id into v_delivery_id
  from public.deliveries as delivery
  where delivery.order_id = new.id
  order by delivery.created_at, delivery.id
  limit 1;

  if v_delivery_id is not null then
    update public.deliveries
    set district_id = new.delivery_district_id,
        shipping_method_id = new.shipping_method_id,
        shipping_method_legacy_id = coalesce(
          new.shipping_method_legacy_id,
          shipping_method_legacy_id
        ),
        delivery_at = new.delivery_at,
        delivery_time = new.delivery_time,
        ship_out_time = new.ship_out_time,
        updated_at = now()
    where id = v_delivery_id
      and (
        district_id is distinct from new.delivery_district_id
        or shipping_method_id is distinct from new.shipping_method_id
        or delivery_at is distinct from new.delivery_at
        or delivery_time is distinct from new.delivery_time
        or ship_out_time is distinct from new.ship_out_time
      );
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
  shipping_method_id, delivery_at, delivery_time, ship_out_time
on public.orders
for each row execute function private.ensure_factory_delivery_for_sent_order();

comment on function private.ensure_factory_delivery_for_sent_order() is
  'Keeps a sent order on the factory board: create the delivery when missing, and move an existing delivery onto the order''s current date, time, district, and shipping method.';
