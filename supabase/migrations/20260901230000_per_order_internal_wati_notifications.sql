-- Internal WATI notifications are order-specific while the daily email remains
-- one aggregate message. Shopify imports enqueue WhatsApp only and use the
-- stable store/order identity as their dedupe cycle.

alter table public.order_reconciliation_alert_outbox
  drop constraint order_reconciliation_alert_outbox_event_key_check;

alter table public.order_reconciliation_alert_outbox
  add constraint order_reconciliation_alert_outbox_event_key_check
  check (event_key in (
    'daily_reconciliation', 'six_hour_reconciliation',
    'late_order_immediate', 'shopify_order_imported'
  ));

alter table public.order_reconciliation_alert_outbox
  add column order_id uuid references public.orders(id) on delete set null;

create index order_reconciliation_alert_outbox_order_idx
  on public.order_reconciliation_alert_outbox (order_id, event_key, created_at desc);

create unique index order_reconciliation_alert_outbox_order_cycle_unique
  on public.order_reconciliation_alert_outbox (
    order_id, event_key, cycle_key, channel, recipient_key
  )
  where order_id is not null;

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
    -- Email stays as one aggregate message per recipient and day.
    insert into public.order_reconciliation_alert_outbox (
      issue_id, order_id, event_key, cycle_key, channel,
      recipient_key, recipient_name, recipient_address
    )
    select null, null, 'daily_reconciliation', v_date_key, 'email',
      recipient.recipient_key,
      recipient.recipient_name,
      recipient.recipient_address
    from private.order_email_notification_recipients() recipient
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;

    if exists (
      select 1 from public.order_reconciliation_issues where status = 'open'
    ) then
      -- WhatsApp is one message per order. Prefer a missing/import issue when
      -- one order also has a factory-unsent issue, preventing duplicate WATI.
      insert into public.order_reconciliation_alert_outbox (
        issue_id, order_id, event_key, cycle_key, channel,
        recipient_key, recipient_name, recipient_address
      )
      select selected.issue_id, selected.order_id,
        'daily_reconciliation', v_date_key, 'whatsapp',
        selected.recipient_key, selected.recipient_name, selected.recipient_address
      from (
        select distinct on (issue.order_id, recipient.id)
          issue.id as issue_id,
          issue.order_id,
          recipient.id::text as recipient_key,
          recipient.name as recipient_name,
          recipient.phone as recipient_address
        from public.order_reconciliation_issues issue
        cross join public.order_first_notification_recipients recipient
        where issue.status = 'open'
        order by issue.order_id, recipient.id,
          case when issue.issue_type = 'factory_unsent' then 1 else 0 end,
          issue.service_at nulls last,
          issue.id
      ) selected
      on conflict do nothing;
    else
      -- Preserve one positive all-clear WATI when there are no open issues.
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

create or replace function private.enqueue_shopify_imported_order_wati()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle_key text;
begin
  if new.shopify_order_id is null then return new; end if;

  if tg_op = 'INSERT' then
    if new.source_system is distinct from 'shopify' then return new; end if;
  else
    if old.shopify_order_id is not distinct from new.shopify_order_id then return new; end if;
  end if;

  v_cycle_key := coalesce(new.shopify_store_id::text, 'unknown-store')
    || ':' || new.shopify_order_id::text;

  insert into public.order_reconciliation_alert_outbox (
    issue_id, order_id, event_key, cycle_key, channel,
    recipient_key, recipient_name, recipient_address
  )
  select null, new.id, 'shopify_order_imported', v_cycle_key, 'whatsapp',
    recipient.id::text, recipient.name, recipient.phone
  from public.order_first_notification_recipients recipient
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.enqueue_shopify_imported_order_wati()
  from public, anon, authenticated;

drop trigger if exists enqueue_shopify_imported_order_wati on public.orders;
create trigger enqueue_shopify_imported_order_wati
after insert or update of shopify_order_id on public.orders
for each row execute function private.enqueue_shopify_imported_order_wati();

comment on function private.enqueue_shopify_imported_order_wati() is
  'Queues one internal WATI per recipient when a Shopify order is first imported or linked; no email is created.';
