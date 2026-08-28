-- Avoid PL/pgSQL output-column ambiguity in the recipient upsert. The
-- function returns an `id` column, so `on conflict (id)` can be resolved as a
-- function variable instead of the table column at runtime.

create or replace function public.save_order_first_notification_recipient(
  p_id uuid,
  p_name text,
  p_phone text,
  p_delay_hours numeric
)
returns table (
  id uuid,
  name text,
  phone text,
  delay_hours numeric
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
begin
  if not private.has_page_manage('orders.settings.first_notification_recipients') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if v_phone = '' then
    raise exception 'phone_required' using errcode = '22023';
  end if;
  if p_delay_hours is null or p_delay_hours < 0 then
    raise exception 'delay_hours_invalid' using errcode = '22023';
  end if;

  insert into public.order_first_notification_recipients as recipient (
    id, name, phone, delay_hours
  ) values (
    v_id, v_name, v_phone, p_delay_hours
  )
  on conflict on constraint order_first_notification_recipients_pkey do update
  set name = excluded.name,
      phone = excluded.phone,
      delay_hours = excluded.delay_hours,
      updated_at = now();

  return query
  select recipient.id, recipient.name, recipient.phone, recipient.delay_hours
  from public.order_first_notification_recipients as recipient
  where recipient.id = v_id;
end;
$$;

revoke all on function public.save_order_first_notification_recipient(uuid, text, text, numeric)
  from public, anon;
grant execute on function public.save_order_first_notification_recipient(uuid, text, text, numeric)
  to authenticated, service_role;
