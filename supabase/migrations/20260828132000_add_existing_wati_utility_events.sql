-- Register approved WATI Utility templates that predate the FCCD event model.
-- Keep them inactive until their parameter names and order are verified.

alter table public.wati_order_notification_templates
  drop constraint if exists wati_order_notification_templates_event_key_check;

alter table public.wati_order_notification_templates
  add constraint wati_order_notification_templates_event_key_check check (event_key in (
    'delivery_order_confirmed', 'pickup_order_confirmed',
    'delivery_tomorrow_reminder', 'pickup_tomorrow_reminder',
    'delivery_today_reminder', 'pickup_today_reminder',
    'order_details_updated', 'delivery_dispatched', 'pickup_ready',
    'order_completed', 'order_cancelled',
    'driver_assigned', 'bad_weather_notice', 'holiday_service_notice',
    'second_contact_requested', 'payment_instructions_sent',
    'payment_confirmed', 'delivery_delayed', 'order_issue_reported'
  ));

insert into public.wati_order_notification_templates
  (event_key, template_name, broadcast_name, parameters, is_active)
values
  ('driver_assigned', 'driver_assign_reminder', 'driver_assign_reminder', '[]'::jsonb, false),
  ('bad_weather_notice', 'fc_bad_weather_reply_3', 'fc_bad_weather_reply_3', '[]'::jsonb, false),
  ('holiday_service_notice', 'fc_holiday_notice', 'fc_holiday_notice', '[]'::jsonb, false),
  ('second_contact_requested', 'second_contact_person', 'second_contact_person', '[]'::jsonb, false),
  ('payment_instructions_sent', 'fcr_new_payment', 'fcr_new_payment', '[]'::jsonb, false),
  ('payment_confirmed', 'fcr_confirmation_paid', 'fcr_confirmation_paid', '[]'::jsonb, false),
  ('delivery_delayed', 'late_delivery_reply', 'late_delivery_reply', '[]'::jsonb, false),
  ('order_issue_reported', 'fck_cny_wrong_order', 'fck_cny_wrong_order', '[]'::jsonb, false)
on conflict (event_key) do update
set template_name = excluded.template_name,
    broadcast_name = excluded.broadcast_name,
    updated_at = now();

create or replace function public.enqueue_manual_wati_order_event(
  p_order_id uuid,
  p_event_key text,
  p_occurrence_key text default null
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if p_event_key not in (
    'driver_assigned', 'bad_weather_notice', 'holiday_service_notice',
    'second_contact_requested', 'payment_instructions_sent',
    'payment_confirmed', 'delivery_delayed', 'order_issue_reported'
  ) then
    raise exception 'unsupported manual WATI order event: %', p_event_key;
  end if;

  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'order not found';
  end if;

  return private.enqueue_wati_order_event(
    p_order_id,
    p_event_key,
    coalesce(nullif(btrim(p_occurrence_key), ''),
      'manual:' || p_event_key || ':' || txid_current()::text)
  );
end;
$$;

revoke all on function public.enqueue_manual_wati_order_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_manual_wati_order_event(uuid, text, text)
  to service_role;

comment on function public.enqueue_manual_wati_order_event(uuid, text, text) is
  'Queues an enabled manual WATI event. Additional Utility templates remain inactive pending parameter verification.';
