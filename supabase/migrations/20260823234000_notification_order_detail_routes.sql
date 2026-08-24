create or replace function private.set_business_notification_detail_route()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order_id uuid;
  v_delivery_id uuid;
begin
  if new.entity_type = 'delivery' and new.entity_id is not null then
    v_delivery_id := new.entity_id;
    select deliveries.order_id into v_order_id
    from public.deliveries
    where deliveries.id = new.entity_id;

    if v_order_id is not null then
      select coalesce(orders.merged_into_order_id, orders.id) into v_order_id
      from public.orders
      where orders.id = v_order_id;
      new.entity_type := 'order';
      new.entity_id := v_order_id;
      new.route := '/orders/' || v_order_id;
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
        || jsonb_build_object('deliveryId', v_delivery_id, 'orderId', v_order_id);
    end if;
  elsif new.entity_type = 'order' and new.entity_id is not null then
    select coalesce(orders.merged_into_order_id, orders.id) into v_order_id
    from public.orders
    where orders.id = new.entity_id;
    if v_order_id is not null then
      new.entity_id := v_order_id;
      new.route := '/orders/' || v_order_id;
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
        || jsonb_build_object('orderId', v_order_id);
    end if;
  elsif new.entity_type = 'quote' and new.entity_id is not null then
    new.route := '/quotes/' || new.entity_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_business_notification_detail_route
on public.business_notifications;

create trigger set_business_notification_detail_route
before insert or update of entity_type, entity_id, route
on public.business_notifications
for each row execute function private.set_business_notification_detail_route();

-- Reassigning route to itself intentionally invokes the normalization trigger
-- for existing delivery/list/workspace notifications.
update public.business_notifications
set route = route
where entity_type in ('order', 'quote', 'delivery');

comment on function private.set_business_notification_detail_route() is
  'Normalizes order-related notification clicks to the canonical order or quote detail page.';
