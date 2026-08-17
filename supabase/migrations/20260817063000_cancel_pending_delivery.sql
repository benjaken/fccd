-- Cancel a pending-pickup delivery from the delivery list.

create or replace function public.cancel_pending_delivery(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_status text;
begin
  if ((select auth.jwt()) -> 'app_metadata' ->> 'role')
    not in ('Super Admin', 'Admin', 'Accounting', 'Factory')
  then
    raise exception 'not allowed to cancel delivery';
  end if;

  select
    delivery.order_id,
    coalesce(nullif(btrim(delivery.delivery_status), ''), orders.delivery_status)
  into v_order_id, v_status
  from public.deliveries as delivery
  left join public.orders on orders.id = delivery.order_id
  where delivery.id = p_delivery_id;

  if not found then
    raise exception 'delivery not found';
  end if;

  if v_status is distinct from '待取貨' then
    raise exception 'only pending pickup deliveries can be cancelled';
  end if;

  delete from public.delivery_surcharges
  where delivery_id = p_delivery_id;

  delete from public.deliveries
  where id = p_delivery_id;

  if v_order_id is not null then
    update public.orders
    set
      delivery_status = '未派車隊',
      updated_at = now()
    where id = v_order_id
      and delivery_status = '待取貨';
  end if;
end;
$$;

revoke all on function public.cancel_pending_delivery(uuid) from public, anon;
grant execute on function public.cancel_pending_delivery(uuid) to authenticated;
