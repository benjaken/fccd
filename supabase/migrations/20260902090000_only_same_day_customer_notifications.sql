-- Automatic WATI/email policy: only same-day delivery and pickup reminders
-- may be queued or sent. Manual confirmation Edge Functions remain separate.

create or replace function private.enqueue_wati_order_event(
  p_order_id uuid,
  p_event_key text,
  p_occurrence_key text
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_inserted integer;
begin
  if p_event_key not in ('delivery_today_reminder', 'pickup_today_reminder') then
    return 0;
  end if;

  insert into public.wati_order_notification_outbox (
    order_id, template_id, event_key, occurrence_key
  )
  select p_order_id, template.id, template.event_key, p_occurrence_key
  from public.wati_order_notification_templates template
  where template.event_key = p_event_key
    and template.is_active
  on conflict (order_id, template_id, occurrence_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Same-day reminders are queued by the cron function, so no order mutation
-- (including Send to Factory) needs a customer-notification trigger.
drop trigger if exists capture_wati_order_events on public.orders;
drop trigger if exists capture_wati_order_events_on_insert on public.orders;
drop trigger if exists capture_wati_order_events_on_update on public.orders;

update public.wati_order_notification_templates
set is_active = false,
    updated_at = now()
where event_key in (
  'delivery_order_confirmed', 'pickup_order_confirmed',
  'delivery_tomorrow_reminder', 'pickup_tomorrow_reminder',
  'order_details_updated', 'delivery_dispatched', 'pickup_ready',
  'order_completed', 'order_cancelled'
);

update public.wati_order_status_event_rules
set is_active = false,
    updated_at = now()
where is_active;

-- Cancel anything already queued but not completed.
update public.wati_order_notification_outbox as outbox
set status = 'skipped',
    wati_skipped_at = case when outbox.wati_sent_at is null
      then coalesce(outbox.wati_skipped_at, now()) else outbox.wati_skipped_at end,
    email_skipped_at = case when outbox.email_sent_at is null
      then coalesce(outbox.email_skipped_at, now()) else outbox.email_skipped_at end,
    wati_error = case when outbox.wati_sent_at is null
      then 'automatic_event_not_allowed' else outbox.wati_error end,
    email_error = case when outbox.email_sent_at is null
      then 'automatic_event_not_allowed' else outbox.email_error end,
    last_error = 'automatic_event_not_allowed',
    locked_at = null,
    updated_at = now()
where outbox.event_key in (
    'delivery_order_confirmed', 'pickup_order_confirmed',
    'delivery_tomorrow_reminder', 'pickup_tomorrow_reminder',
    'order_details_updated', 'delivery_dispatched', 'pickup_ready',
    'order_completed', 'order_cancelled'
  )
  and outbox.sent_at is null
  and outbox.status in ('pending', 'processing', 'failed');

comment on function private.enqueue_wati_order_event(uuid, text, text) is
  'Queues only delivery_today_reminder and pickup_today_reminder automatic events.';

-- Manual utility events remain available, but bypass the automatic enqueue
-- allowlist and still require an explicit service-role action.
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
declare
  v_inserted integer;
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

  insert into public.wati_order_notification_outbox (
    order_id, template_id, event_key, occurrence_key
  )
  select p_order_id, template.id, template.event_key,
    'manual:' || p_event_key || ':' || coalesce(
      nullif(btrim(p_occurrence_key), ''), txid_current()::text
    )
  from public.wati_order_notification_templates template
  where template.event_key = p_event_key
    and template.is_active
  on conflict (order_id, template_id, occurrence_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.enqueue_manual_wati_order_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_manual_wati_order_event(uuid, text, text)
  to service_role;
