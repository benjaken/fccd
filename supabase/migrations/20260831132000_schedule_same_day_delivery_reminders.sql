-- Send delivery reminders on the delivery date at 09:00 Hong Kong time.
-- For delivery windows starting at or before 11:00, send two hours before the
-- beginning of the window. Pickup reminders are sent at 09:00 on the pickup
-- date. All reminder templates stay inactive until the final rollout approval.

create or replace function private.wati_delivery_start_time(p_delivery_time text)
returns time without time zone
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_match text[];
  v_hour integer;
  v_minute integer;
  v_meridiem text;
begin
  v_match := regexp_match(
    coalesce(p_delivery_time, ''),
    '([0-9]{1,2})(?::([0-9]{2}))?[[:space:]]*([AaPp][Mm])?'
  );
  if v_match is null then return null; end if;

  v_hour := v_match[1]::integer;
  v_minute := coalesce(nullif(v_match[2], ''), '0')::integer;
  v_meridiem := lower(coalesce(v_match[3], ''));

  if v_minute < 0 or v_minute > 59 then return null; end if;
  if v_meridiem <> '' then
    if v_hour < 1 or v_hour > 12 then return null; end if;
    if v_meridiem = 'am' and v_hour = 12 then v_hour := 0; end if;
    if v_meridiem = 'pm' and v_hour < 12 then v_hour := v_hour + 12; end if;
  elsif v_hour < 0 or v_hour > 23 then
    return null;
  end if;

  return make_time(v_hour, v_minute, 0);
end;
$$;

create or replace function private.wati_delivery_reminder_at(p_order public.orders)
returns timestamptz
language plpgsql
stable
set search_path = public, private, pg_catalog
as $$
declare
  v_delivery_date date;
  v_delivery_start time without time zone;
  v_due_local timestamp without time zone;
begin
  if p_order.delivery_at is null then return null; end if;

  v_delivery_date := (p_order.delivery_at at time zone 'Asia/Hong_Kong')::date;
  v_delivery_start := private.wati_delivery_start_time(p_order.delivery_time);

  if v_delivery_start is not null and v_delivery_start <= time '11:00' then
    v_due_local := v_delivery_date + v_delivery_start - interval '2 hours';
  else
    v_due_local := v_delivery_date + time '09:00';
  end if;

  return v_due_local at time zone 'Asia/Hong_Kong';
end;
$$;

create or replace function public.enqueue_due_wati_order_reminders(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_order public.orders%rowtype;
  v_local_date date := (p_now at time zone 'Asia/Hong_Kong')::date;
  v_delivery_date date;
  v_method text;
  v_event_key text;
  v_count integer := 0;
begin
  for v_order in
    select orders.*
    from public.orders orders
    where orders.document_type = 'order'
      and orders.archived_at is null
      and (orders.delivery_at at time zone 'Asia/Hong_Kong')::date
          in (v_local_date, v_local_date + 1)
  loop
    v_delivery_date := (v_order.delivery_at at time zone 'Asia/Hong_Kong')::date;
    v_method := private.wati_delivery_method(v_order);

    if v_method = 'delivery' then
      -- The delivery-day template is the only scheduled delivery reminder.
      -- Looking one day ahead also supports very early windows whose two-hour
      -- reminder falls on the previous evening.
      if p_now < private.wati_delivery_reminder_at(v_order) then continue; end if;
      v_event_key := 'delivery_today_reminder';
    elsif v_delivery_date <> v_local_date then
      -- Do not enqueue a pickup reminder on the preceding day.
      continue;
    elsif p_now < ((v_delivery_date + time '09:00') at time zone 'Asia/Hong_Kong') then
      continue;
    else
      v_event_key := 'pickup_today_reminder';
    end if;

    v_count := v_count + private.enqueue_wati_order_event(
      v_order.id,
      v_event_key,
      v_event_key || ':' || v_delivery_date::text
    );
  end loop;
  return v_count;
end;
$$;

revoke all on function public.enqueue_due_wati_order_reminders(timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_due_wati_order_reminders(timestamptz)
  to service_role;

update public.wati_order_notification_templates
set is_active = false,
    updated_at = now()
where event_key in (
  'delivery_today_reminder',
  'delivery_tomorrow_reminder',
  'pickup_today_reminder',
  'pickup_tomorrow_reminder'
);
