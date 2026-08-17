-- Order delivery window, and operations can assign a fleet on the list.

alter table public.orders
  add column if not exists delivery_time text;

comment on column public.orders.delivery_time is
  'Bubble A_Order Delivery_Time window, e.g. 18:00 - 19:00.';

create or replace function public.assign_delivery_motorcade(
  p_delivery_id uuid,
  p_motorcade_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if ((select auth.jwt()) -> 'app_metadata' ->> 'role')
    not in ('Super Admin', 'Admin', 'Accounting', 'Factory')
  then
    raise exception 'not allowed to assign delivery fleet';
  end if;

  update public.deliveries
  set
    motorcade_id = p_motorcade_id,
    updated_at = now()
  where id = p_delivery_id;

  if not found then
    raise exception 'delivery not found';
  end if;
end;
$$;

revoke all on function public.assign_delivery_motorcade(uuid, uuid)
  from public, anon;
grant execute on function public.assign_delivery_motorcade(uuid, uuid)
  to authenticated;
