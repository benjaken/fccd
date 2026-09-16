-- The daily internal WhatsApp alert for missing FCCD orders only notifies when
-- the order's delivery date is within three days (today onward) or already
-- overdue. The daily email still lists every open issue, so far-future orders
-- stay visible there without pinging staff on WhatsApp every morning.

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
      select 1 from public.order_reconciliation_issues issue
      where issue.status = 'open'
        and (issue.issue_type <> 'insufficient_stock'
          or private.inventory_shortage_notifications_enabled())
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
          and (
            issue.issue_type not in ('missing_fccd', 'unlinked_fccd')
            or coalesce(order_row.factory_date, order_row.delivery_at) is null
            or (coalesce(order_row.factory_date, order_row.delivery_at)
              at time zone 'Asia/Hong_Kong')::date <= v_today + 2
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
  'Queues the daily reconciliation email and per-order WhatsApp alerts; missing_fccd/unlinked_fccd WhatsApp alerts are limited to delivery dates within three days (or overdue).';
