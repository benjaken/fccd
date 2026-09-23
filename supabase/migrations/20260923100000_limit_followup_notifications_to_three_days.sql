-- The daily internal follow-up (order reconciliation / readiness) only notifies
-- for delivery dates within three days from today (today through today + 3).
-- Orders without a delivery date and the independent inventory-shortage alert
-- still notify. The unassigned-driver problem is no longer part of the daily
-- follow-up; it is handled by the dedicated driver reminder sent once at 17:00
-- Hong Kong time the day before delivery.

create or replace function private.enqueue_order_reconciliation_alerts(
  p_now timestamptz,
  p_daily boolean
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_date_key text := (p_now at time zone 'Asia/Hong_Kong')::date::text;
  v_today date := (p_now at time zone 'Asia/Hong_Kong')::date;
  v_inserted integer := 0;
  v_rows integer := 0;
begin
  if p_daily then
    insert into public.order_reconciliation_alert_outbox (
      issue_id, order_id, event_key, cycle_key, channel,
      recipient_key, recipient_name, recipient_address
    )
    select null, null, 'daily_reconciliation', v_date_key, 'email',
      recipient.recipient_key, recipient.recipient_name, recipient.recipient_address
    from private.order_email_notification_recipients() recipient
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;

    if exists (
      select 1
      from public.order_reconciliation_issues issue
      join public.orders order_row on order_row.id = issue.order_id
      where issue.status = 'open'
        and (issue.issue_type <> 'insufficient_stock'
          or private.inventory_shortage_notifications_enabled())
        and issue.issue_type <> 'driver_unassigned'
        and (
          issue.issue_type = 'insufficient_stock'
          or coalesce(order_row.factory_date, order_row.delivery_at) is null
          or (coalesce(order_row.factory_date, order_row.delivery_at)
            at time zone 'Asia/Hong_Kong')::date <= v_today + 3
        )
    ) then
      insert into public.order_reconciliation_alert_outbox (
        issue_id, order_id, event_key, cycle_key, channel,
        recipient_key, recipient_name, recipient_address
      )
      select selected.issue_id, selected.order_id,
        'daily_reconciliation', v_date_key, 'whatsapp',
        selected.recipient_key, selected.recipient_name, selected.recipient_address
      from (
        select distinct on (issue.order_id, recipient.id)
          issue.id as issue_id, issue.order_id,
          recipient.id::text as recipient_key,
          recipient.name as recipient_name,
          recipient.phone as recipient_address
        from public.order_reconciliation_issues issue
        join public.orders order_row on order_row.id = issue.order_id
        cross join public.order_first_notification_recipients recipient
        where issue.status = 'open'
          and (issue.issue_type <> 'insufficient_stock'
            or private.inventory_shortage_notifications_enabled())
          and issue.issue_type <> 'driver_unassigned'
          and (
            issue.issue_type = 'insufficient_stock'
            or coalesce(order_row.factory_date, order_row.delivery_at) is null
            or (coalesce(order_row.factory_date, order_row.delivery_at)
              at time zone 'Asia/Hong_Kong')::date <= v_today + 3
          )
        order by issue.order_id, recipient.id,
          case issue.issue_type
            when 'missing_fccd' then 0
            when 'unlinked_fccd' then 1
            when 'missing_delivery_date' then 2
            when 'factory_unsent' then 3
            when 'kitchen_not_visible' then 4
            when 'driver_unassigned' then 5
            when 'insufficient_stock' then 6
            else 7
          end,
          issue.service_at nulls last, issue.id
      ) selected
      on conflict do nothing;
    else
      insert into public.order_reconciliation_alert_outbox (
        issue_id, order_id, event_key, cycle_key, channel,
        recipient_key, recipient_name, recipient_address
      )
      select null, null, 'daily_reconciliation', v_date_key, 'whatsapp',
        recipient.id::text, recipient.name, recipient.phone
      from public.order_first_notification_recipients recipient
      on conflict do nothing;
    end if;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end if;

  insert into public.order_reconciliation_alert_outbox (
    issue_id, order_id, event_key, cycle_key, channel,
    recipient_key, recipient_name, recipient_address
  )
  select issue.id, issue.order_id,
    case when issue.first_detected_at >= p_now - interval '10 minutes'
      then 'late_order_immediate' else 'six_hour_reconciliation' end,
    'urgent', 'email', recipient.recipient_key,
    recipient.recipient_name, recipient.recipient_address
  from public.order_reconciliation_issues issue
  cross join private.order_email_notification_recipients() recipient
  where issue.status = 'open' and issue.severity = 'urgent'
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  insert into public.order_reconciliation_alert_outbox (
    issue_id, order_id, event_key, cycle_key, channel,
    recipient_key, recipient_name, recipient_address
  )
  select issue.id, issue.order_id,
    case when issue.first_detected_at >= p_now - interval '10 minutes'
      then 'late_order_immediate' else 'six_hour_reconciliation' end,
    'urgent', 'whatsapp', recipient.id::text, recipient.name, recipient.phone
  from public.order_reconciliation_issues issue
  cross join public.order_first_notification_recipients recipient
  where issue.status = 'open' and issue.severity = 'urgent'
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_inserted + v_rows;
end;
$$;

comment on function private.enqueue_order_reconciliation_alerts(timestamptz, boolean) is
  'Queues the daily reconciliation email and per-order WhatsApp alerts; the daily follow-up is limited to delivery dates within three days (today through today + 3), unassigned-driver problems are handled by the dedicated driver reminder, and orders without a delivery date plus inventory shortages still notify.';

-- The unassigned-driver reminder now fires once per day at 17:00 Hong Kong time
-- for the next day's deliveries instead of every three hours.
create or replace function public.enqueue_driver_assignment_internal_reminders(
  p_reminder_date date,
  p_reminder_hour smallint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
  v_whatsapp_inserted integer;
begin
  if p_reminder_date is null then
    raise exception 'reminder_date_required' using errcode = '22004';
  end if;
  if p_reminder_hour not in (17) then
    raise exception 'invalid_driver_reminder_hour' using errcode = '22023';
  end if;

  -- Template activation is the single rollout switch for both channels.
  if not exists (
    select 1
    from public.wati_order_notification_templates template
    where template.event_key = 'driver_assigned'
      and template.is_active
  ) then
    return 0;
  end if;

  insert into public.driver_assignment_internal_reminder_outbox (
    reminder_date, reminder_hour, channel, recipient_key, recipient_name, recipient_address
  )
  select
    p_reminder_date,
    p_reminder_hour,
    'email',
    recipient.recipient_key,
    recipient.recipient_name,
    recipient.recipient_address
  from private.order_email_notification_recipients() as recipient
  on conflict (reminder_date, reminder_hour, channel, recipient_key) do nothing;

  get diagnostics v_inserted = row_count;

  insert into public.driver_assignment_internal_reminder_outbox (
    reminder_date, reminder_hour, channel, recipient_key, recipient_name, recipient_address
  )
  select
    p_reminder_date,
    p_reminder_hour,
    'whatsapp',
    recipient.id::text,
    recipient.name,
    recipient.phone
  from public.order_first_notification_recipients as recipient
  on conflict (reminder_date, reminder_hour, channel, recipient_key) do nothing;

  get diagnostics v_whatsapp_inserted = row_count;
  return v_inserted + v_whatsapp_inserted;
end;
$$;

comment on function public.enqueue_driver_assignment_internal_reminders(date, smallint) is
  'Queues the internal unassigned-driver reminder for the next day''s deliveries; the only valid slot is 17:00 Hong Kong time.';

revoke all on function public.enqueue_driver_assignment_internal_reminders(date, smallint)
  from public, anon, authenticated;
grant execute on function public.enqueue_driver_assignment_internal_reminders(date, smallint)
  to service_role;
