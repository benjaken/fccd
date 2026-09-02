-- Restore the factory dispatch-time RPC. The original migration
-- (20260824090000) was never applied to the production project, while the
-- deployed frontend already calls this function.

create or replace function public.update_factory_order_dispatch_time(
  p_order_id uuid,
  p_ship_out_time text
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_ship_out_time text := nullif(btrim(p_ship_out_time), '');
begin
  if private.jwt_app_role() not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'factory_dispatch_time_update_forbidden' using errcode = '42501';
  end if;

  if v_ship_out_time is null
    or v_ship_out_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  then
    raise exception 'invalid_ship_out_time' using errcode = '22023';
  end if;

  update public.orders
  set ship_out_time = v_ship_out_time,
      updated_at = now()
  where id = p_order_id
    and document_type = 'order';

  if not found then
    raise exception 'factory_order_not_found' using errcode = 'P0002';
  end if;

  update public.deliveries
  set ship_out_time = v_ship_out_time,
      updated_at = now()
  where order_id = p_order_id;
end;
$$;

revoke all on function public.update_factory_order_dispatch_time(uuid, text)
  from public;
grant execute on function public.update_factory_order_dispatch_time(uuid, text)
  to authenticated;

comment on function public.update_factory_order_dispatch_time(uuid, text) is
  'Updates the factory order and delivery dispatch time together.';
