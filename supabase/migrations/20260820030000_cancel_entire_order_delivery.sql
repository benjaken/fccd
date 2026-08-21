-- Office can cancel an entire delivery at any dispatch stage.  Keep the order,
-- delivery, surcharge, photo, and timestamp records for audit purposes.

create or replace function public.cancel_order_delivery(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if ((select auth.jwt()) -> 'app_metadata' ->> 'role')
    not in ('Super Admin', 'Admin', 'Accounting', 'Factory')
  then
    raise exception 'not allowed to cancel order delivery';
  end if;

  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'order not found';
  end if;

  update public.deliveries
  set
    delivery_status = '已取消',
    motorcade_id = null,
    motorcade_legacy_id = null,
    subdriver_id = null,
    subdriver_legacy_id = null,
    updated_at = now()
  where order_id = p_order_id;

  update public.orders
  set
    delivery_status = '已取消',
    updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.cancel_order_delivery(uuid) from public, anon;
grant execute on function public.cancel_order_delivery(uuid) to authenticated;
