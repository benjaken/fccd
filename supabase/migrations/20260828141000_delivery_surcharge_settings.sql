-- Manage delivery surcharge categories from Delivery & Drivers and keep the
-- driver portal restricted to currently active categories.

drop policy if exists "Administrators insert delivery_surcharge_types"
  on public.delivery_surcharge_types;
drop policy if exists "Administrators update delivery_surcharge_types"
  on public.delivery_surcharge_types;
drop policy if exists "Administrators delete delivery_surcharge_types"
  on public.delivery_surcharge_types;

create policy "Delivery managers insert surcharge types"
on public.delivery_surcharge_types
for insert to authenticated
with check (private.has_page_manage('delivery'));

create policy "Delivery managers update surcharge types"
on public.delivery_surcharge_types
for update to authenticated
using (private.has_page_manage('delivery'))
with check (private.has_page_manage('delivery'));

create policy "Delivery managers delete surcharge types"
on public.delivery_surcharge_types
for delete to authenticated
using (private.has_page_manage('delivery'));

create or replace function public.driver_delivery_add_surcharge(
  p_session_token uuid,
  p_delivery_id uuid,
  p_surcharge_type_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_team_id uuid;
  v_surcharge_id uuid := gen_random_uuid();
begin
  select session.delivery_team_id
  into v_team_id
  from private.driver_delivery_sessions session
  where session.token = p_session_token
    and session.expires_at > now();

  if v_team_id is null or not exists (
    select 1
    from public.deliveries
    where id = p_delivery_id
      and motorcade_id = v_team_id
  ) then
    raise exception 'invalid driver session or delivery';
  end if;

  if not exists (
    select 1
    from public.delivery_surcharge_types surcharge_type
    where surcharge_type.id = p_surcharge_type_id
      and surcharge_type.is_active = true
  ) then
    raise exception 'inactive or invalid surcharge type';
  end if;

  if p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  insert into public.delivery_surcharges (
    id,
    legacy_id,
    delivery_id,
    surcharge_type_id,
    amount
  ) values (
    v_surcharge_id,
    'driver-portal:' || v_surcharge_id,
    p_delivery_id,
    p_surcharge_type_id,
    p_amount
  );

  update public.deliveries
  set total_fee = coalesce(total_fee, basic_fee, 0) + p_amount,
      updated_at = now()
  where id = p_delivery_id;
end;
$$;
