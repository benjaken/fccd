-- A daily reconciliation is useful even when there are no issues: recipients
-- get one positive all-clear message instead of silence.

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
  v_inserted integer := 0;
  v_rows integer := 0;
begin
  if p_daily then
    insert into public.order_reconciliation_alert_outbox (
      issue_id, event_key, cycle_key, channel,
      recipient_key, recipient_name, recipient_address
    )
    select null, 'daily_reconciliation', v_date_key, 'email',
      profile.id::text,
      coalesce(nullif(btrim(profile.user_name), ''), profile.email),
      btrim(profile.email)
    from public.user_profiles profile
    where profile.email_noti
      and nullif(btrim(profile.email), '') is not null
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;

    insert into public.order_reconciliation_alert_outbox (
      issue_id, event_key, cycle_key, channel,
      recipient_key, recipient_name, recipient_address
    )
    select null, 'daily_reconciliation', v_date_key, 'whatsapp',
      recipient.id::text, recipient.name, recipient.phone
    from public.order_first_notification_recipients recipient
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end if;

  insert into public.order_reconciliation_alert_outbox (
    issue_id, event_key, cycle_key, channel,
    recipient_key, recipient_name, recipient_address
  )
  select issue.id,
    case when issue.first_detected_at >= p_now - interval '10 minutes'
      then 'late_order_immediate' else 'six_hour_reconciliation' end,
    'urgent', 'email', profile.id::text,
    coalesce(nullif(btrim(profile.user_name), ''), profile.email),
    btrim(profile.email)
  from public.order_reconciliation_issues issue
  cross join public.user_profiles profile
  where issue.status = 'open' and issue.severity = 'urgent'
    and profile.email_noti
    and nullif(btrim(profile.email), '') is not null
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  insert into public.order_reconciliation_alert_outbox (
    issue_id, event_key, cycle_key, channel,
    recipient_key, recipient_name, recipient_address
  )
  select issue.id,
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
