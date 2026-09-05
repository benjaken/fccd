-- Keep the production customer-service pilot limited to the current four
-- order first-notification recipients. Equal start/end is intentionally the
-- existing all-day schedule semantics used by the Edge Function.

do $$
declare
  v_allowed_phones text[];
begin
  select array_agg(recipient.phone order by recipient.phone)
  into v_allowed_phones
  from (
    select distinct regexp_replace(phone, '\D', '', 'g') as phone
    from public.order_first_notification_recipients
    where regexp_replace(phone, '\D', '', 'g') ~ '^\d{8,15}$'
  ) recipient;

  if coalesce(cardinality(v_allowed_phones), 0) <> 4 then
    raise exception
      'customer_service_pilot_requires_exactly_four_first_notification_recipients';
  end if;

  update public.customer_service_controls
  set
    bot_enabled = true,
    allowed_phones = v_allowed_phones,
    auto_reply_start = '00:00',
    auto_reply_end = '00:00',
    auto_reply_timezone = 'Asia/Hong_Kong',
    updated_at = now()
  where id = 'global';

  if not found then
    raise exception 'customer_service_global_controls_missing';
  end if;
end;
$$;
