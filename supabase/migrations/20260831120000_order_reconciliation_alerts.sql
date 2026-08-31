-- Internal Shopify/FCCD reconciliation and urgent factory-send alerts.
-- All recipients come from internal FCCD settings; customer contact snapshots
-- are never used as notification destinations.

create table public.order_reconciliation_issues (
  id uuid primary key default gen_random_uuid(),
  issue_type text not null check (issue_type in (
    'missing_fccd', 'unlinked_fccd', 'factory_unsent', 'missing_service_time'
  )),
  order_id uuid not null references public.orders(id) on delete cascade,
  shopify_store_id uuid references public.shopify_stores(id) on delete set null,
  shopify_order_id bigint,
  severity text not null default 'important'
    check (severity in ('normal', 'important', 'urgent')),
  service_at timestamptz,
  status text not null default 'open' check (status in ('open', 'resolved')),
  first_detected_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (issue_type, order_id)
);

create index order_reconciliation_issues_open_idx
  on public.order_reconciliation_issues (severity, service_at, last_checked_at)
  where status = 'open';

create table public.order_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  scope_start date not null,
  scope_end text not null default 'future',
  shopify_count integer not null default 0,
  fccd_matched_count integer not null default 0,
  missing_fccd_count integer not null default 0,
  unlinked_fccd_count integer not null default 0,
  factory_unsent_count integer not null default 0,
  urgent_count integer not null default 0,
  store_summary jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique (run_date)
);

create table public.order_reconciliation_alert_outbox (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references public.order_reconciliation_issues(id) on delete cascade,
  event_key text not null check (event_key in (
    'daily_reconciliation', 'six_hour_reconciliation', 'late_order_immediate'
  )),
  cycle_key text not null,
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient_key text not null,
  recipient_name text not null,
  recipient_address text not null,
  scheduled_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_response jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (
    issue_id, event_key, cycle_key, channel, recipient_key
  )
);

create index order_reconciliation_alert_outbox_pending_idx
  on public.order_reconciliation_alert_outbox (scheduled_at, created_at)
  where status in ('pending', 'failed');

alter table public.order_reconciliation_issues enable row level security;
alter table public.order_reconciliation_runs enable row level security;
alter table public.order_reconciliation_alert_outbox enable row level security;

revoke all on public.order_reconciliation_issues,
  public.order_reconciliation_runs,
  public.order_reconciliation_alert_outbox from anon, authenticated;
grant all on public.order_reconciliation_issues,
  public.order_reconciliation_runs,
  public.order_reconciliation_alert_outbox to service_role;

grant select on public.order_reconciliation_issues,
  public.order_reconciliation_runs to authenticated;

create policy order_reconciliation_issues_internal_read
on public.order_reconciliation_issues for select to authenticated
using (
  private.has_page_access('orders.shopify_pending')
  or private.has_page_access('orders')
);

create policy order_reconciliation_runs_internal_read
on public.order_reconciliation_runs for select to authenticated
using (
  private.has_page_access('orders.shopify_pending')
  or private.has_page_access('orders')
);

create or replace function private.order_reconciliation_service_at(
  p_factory_date timestamptz,
  p_delivery_at timestamptz,
  p_ship_out_time text,
  p_delivery_time text
)
returns timestamptz
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_date date;
  v_time_text text;
  v_match text[];
  v_hour integer;
  v_minute integer;
  v_meridiem text;
begin
  v_date := (coalesce(p_factory_date, p_delivery_at) at time zone 'Asia/Hong_Kong')::date;
  if v_date is null then return null; end if;

  v_time_text := lower(coalesce(
    nullif(btrim(p_ship_out_time), ''),
    nullif(btrim(p_delivery_time), '')
  ));
  if v_time_text is null then return null; end if;

  v_match := regexp_match(v_time_text, '([0-9]{1,2})(:([0-9]{2}))?[[:space:]]*(am|pm)?');
  if v_match is null then return null; end if;
  v_hour := v_match[1]::integer;
  v_minute := coalesce(nullif(v_match[3], '')::integer, 0);
  v_meridiem := nullif(v_match[4], '');
  if v_meridiem = 'pm' and v_hour < 12 then v_hour := v_hour + 12; end if;
  if v_meridiem = 'am' and v_hour = 12 then v_hour := 0; end if;
  if v_hour > 23 or v_minute > 59 then return null; end if;

  return make_timestamptz(
    extract(year from v_date)::integer,
    extract(month from v_date)::integer,
    extract(day from v_date)::integer,
    v_hour,
    v_minute,
    0,
    'Asia/Hong_Kong'
  );
end;
$$;

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
  if p_daily and exists (
    select 1 from public.order_reconciliation_issues where status = 'open'
  ) then
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

create or replace function public.refresh_order_reconciliation(
  p_now timestamptz default now(),
  p_force_daily boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_today date := (p_now at time zone 'Asia/Hong_Kong')::date;
  v_scope_start date := ((p_now at time zone 'Asia/Hong_Kong')::date - interval '1 month')::date;
  v_daily boolean;
  v_shopify_count integer;
  v_fccd_count integer;
  v_missing_count integer;
  v_unlinked_count integer;
  v_factory_count integer;
  v_urgent_count integer;
  v_store_summary jsonb;
  v_alerts integer;
  v_issue record;
  v_profile record;
begin
  v_daily := p_force_daily or (
    extract(hour from p_now at time zone 'Asia/Hong_Kong') >= 9
    and not exists (
      select 1 from public.order_reconciliation_runs where run_date = v_today
    )
  );

  with candidates as (
    select orders.*,
      private.order_reconciliation_service_at(
        orders.factory_date, orders.delivery_at,
        orders.ship_out_time, orders.delivery_time
      ) as service_at
    from public.orders orders
    where orders.document_type = 'order'
      and orders.archived_at is null
      and orders.merged_into_order_id is null
      and coalesce(orders.delivery_status, '') !~* '(cancel|取消)'
      and (
        coalesce(orders.factory_date, orders.delivery_at) is null
        or (coalesce(orders.factory_date, orders.delivery_at) at time zone 'Asia/Hong_Kong')::date >= v_scope_start
      )
  )
  insert into public.order_reconciliation_issues as issue (
    issue_type, order_id, shopify_store_id, shopify_order_id,
    severity, service_at, status, last_checked_at, resolved_at, metadata
  )
  select 'missing_fccd', candidate.id, candidate.shopify_store_id,
    candidate.shopify_order_id,
    case when candidate.service_at between p_now and p_now + interval '6 hours'
      then 'urgent' else 'important' end,
    candidate.service_at, 'open', p_now, null,
    jsonb_build_object('orderNumber', candidate.order_number)
  from candidates candidate
  where candidate.source_system = 'shopify'
    and candidate.shopify_order_id is not null
  on conflict (issue_type, order_id) do update
  set shopify_store_id = excluded.shopify_store_id,
      shopify_order_id = excluded.shopify_order_id,
      severity = excluded.severity,
      service_at = excluded.service_at,
      status = 'open',
      last_checked_at = p_now,
      resolved_at = null,
      metadata = issue.metadata || excluded.metadata;

  update public.order_reconciliation_issues issue
  set status = 'resolved', resolved_at = p_now, last_checked_at = p_now
  where issue.issue_type = 'missing_fccd' and issue.status = 'open'
    and not exists (
      select 1 from public.orders orders
      where orders.id = issue.order_id
        and orders.document_type = 'order'
        and orders.archived_at is null
        and orders.merged_into_order_id is null
        and orders.source_system = 'shopify'
        and orders.shopify_order_id is not null
        and coalesce(orders.delivery_status, '') !~* '(cancel|取消)'
        and (
          coalesce(orders.factory_date, orders.delivery_at) is null
          or (coalesce(orders.factory_date, orders.delivery_at) at time zone 'Asia/Hong_Kong')::date >= v_scope_start
        )
    );

  with candidates as (
    select orders.*,
      private.order_reconciliation_service_at(
        orders.factory_date, orders.delivery_at,
        orders.ship_out_time, orders.delivery_time
      ) as service_at
    from public.orders orders
    where orders.document_type = 'order'
      and orders.archived_at is null
      and orders.merged_into_order_id is null
      and orders.source_system is distinct from 'shopify'
      and coalesce(orders.is_shopify_order, false)
      and orders.shopify_order_id is null
      and (
        coalesce(orders.factory_date, orders.delivery_at) is null
        or (coalesce(orders.factory_date, orders.delivery_at) at time zone 'Asia/Hong_Kong')::date >= v_scope_start
      )
  )
  insert into public.order_reconciliation_issues as issue (
    issue_type, order_id, shopify_store_id, shopify_order_id,
    severity, service_at, status, last_checked_at, resolved_at, metadata
  )
  select 'unlinked_fccd', candidate.id, candidate.shopify_store_id, null,
    case when candidate.service_at between p_now and p_now + interval '6 hours'
      then 'urgent' else 'important' end,
    candidate.service_at, 'open', p_now, null,
    jsonb_build_object('orderNumber', candidate.order_number)
  from candidates candidate
  on conflict (issue_type, order_id) do update
  set severity = excluded.severity, service_at = excluded.service_at,
      status = 'open', last_checked_at = p_now, resolved_at = null,
      metadata = issue.metadata || excluded.metadata;

  update public.order_reconciliation_issues issue
  set status = 'resolved', resolved_at = p_now, last_checked_at = p_now
  where issue.issue_type = 'unlinked_fccd' and issue.status = 'open'
    and not exists (
      select 1 from public.orders orders where orders.id = issue.order_id
        and orders.document_type = 'order' and orders.archived_at is null
        and orders.merged_into_order_id is null
        and orders.source_system is distinct from 'shopify'
        and coalesce(orders.is_shopify_order, false)
        and orders.shopify_order_id is null
        and coalesce(orders.delivery_status, '') !~* '(cancel|取消)'
    );

  with candidates as (
    select orders.*,
      private.order_reconciliation_service_at(
        orders.factory_date, orders.delivery_at,
        orders.ship_out_time, orders.delivery_time
      ) as service_at,
      (coalesce(orders.factory_date, orders.delivery_at) at time zone 'Asia/Hong_Kong')::date as service_date
    from public.orders orders
    where orders.document_type = 'order'
      and orders.archived_at is null
      and orders.merged_into_order_id is null
      and not coalesce(orders.is_sent_to_factory, false)
      and not coalesce(orders.do_not_send_to_factory, false)
      and coalesce(orders.delivery_status, '') !~* '(cancel|取消)'
  )
  insert into public.order_reconciliation_issues as issue (
    issue_type, order_id, shopify_store_id, shopify_order_id,
    severity, service_at, status, last_checked_at, resolved_at, metadata
  )
  select 'factory_unsent', candidate.id, candidate.shopify_store_id,
    candidate.shopify_order_id,
    case when candidate.service_at between p_now and p_now + interval '6 hours'
      then 'urgent' else 'important' end,
    candidate.service_at, 'open', p_now, null,
    jsonb_build_object('orderNumber', candidate.order_number)
  from candidates candidate
  where candidate.service_date between v_today and v_today + 2
     or candidate.service_at between p_now and p_now + interval '6 hours'
  on conflict (issue_type, order_id) do update
  set severity = excluded.severity, service_at = excluded.service_at,
      status = 'open', last_checked_at = p_now, resolved_at = null,
      metadata = issue.metadata || excluded.metadata;

  update public.order_reconciliation_issues issue
  set status = 'resolved', resolved_at = p_now, last_checked_at = p_now
  where issue.issue_type = 'factory_unsent' and issue.status = 'open'
    and not exists (
      select 1 from public.orders orders where orders.id = issue.order_id
        and orders.document_type = 'order' and orders.archived_at is null
        and orders.merged_into_order_id is null
        and not coalesce(orders.is_sent_to_factory, false)
        and not coalesce(orders.do_not_send_to_factory, false)
        and coalesce(orders.delivery_status, '') !~* '(cancel|取消)'
        and (
          (coalesce(orders.factory_date, orders.delivery_at) at time zone 'Asia/Hong_Kong')::date
            between v_today and v_today + 2
          or private.order_reconciliation_service_at(
            orders.factory_date, orders.delivery_at,
            orders.ship_out_time, orders.delivery_time
          ) between p_now and p_now + interval '6 hours'
        )
    );

  with candidates as (
    select orders.*,
      (coalesce(orders.factory_date, orders.delivery_at) at time zone 'Asia/Hong_Kong')::date as service_date
    from public.orders orders
    where orders.document_type = 'order'
      and orders.archived_at is null
      and orders.merged_into_order_id is null
      and (orders.source_system = 'shopify'
        or not coalesce(orders.is_sent_to_factory, false))
      and coalesce(orders.factory_date, orders.delivery_at) is not null
      and (coalesce(orders.factory_date, orders.delivery_at) at time zone 'Asia/Hong_Kong')::date >= v_scope_start
      and private.order_reconciliation_service_at(
        orders.factory_date, orders.delivery_at,
        orders.ship_out_time, orders.delivery_time
      ) is null
  )
  insert into public.order_reconciliation_issues as issue (
    issue_type, order_id, shopify_store_id, shopify_order_id,
    severity, service_at, status, last_checked_at, resolved_at, metadata
  )
  select 'missing_service_time', candidate.id, candidate.shopify_store_id,
    candidate.shopify_order_id,
    case when candidate.service_date <= v_today then 'urgent' else 'important' end,
    null, 'open', p_now, null,
    jsonb_build_object('orderNumber', candidate.order_number, 'serviceDate', candidate.service_date)
  from candidates candidate
  on conflict (issue_type, order_id) do update
  set severity = excluded.severity, status = 'open',
      last_checked_at = p_now, resolved_at = null,
      metadata = issue.metadata || excluded.metadata;

  update public.order_reconciliation_issues issue
  set status = 'resolved', resolved_at = p_now, last_checked_at = p_now
  where issue.issue_type = 'missing_service_time' and issue.status = 'open'
    and not exists (
      select 1 from public.orders orders where orders.id = issue.order_id
        and orders.document_type = 'order' and orders.archived_at is null
        and private.order_reconciliation_service_at(
          orders.factory_date, orders.delivery_at,
          orders.ship_out_time, orders.delivery_time
        ) is null
    );

  -- Urgent in-app notifications are internal and permission-scoped.
  for v_issue in
    select issue.*, orders.order_number, orders.customer_name_snapshot,
      orders.company_name_snapshot
    from public.order_reconciliation_issues issue
    join public.orders orders on orders.id = issue.order_id
    where issue.status = 'open' and issue.severity = 'urgent'
  loop
    for v_profile in
      select distinct profile.id
      from public.user_profiles profile
      join public.role_page_permissions permission on permission.role = profile.role
      where permission.page_key in ('orders', 'orders.shopify_pending')
        and permission.can_access
    loop
      perform private.upsert_business_notification(
        v_profile.id,
        'order-reconciliation-urgent:' || v_issue.id,
        'order_reconciliation_urgent', 'action', 'urgent',
        '緊急漏單預警',
        concat(
          coalesce(v_issue.order_number, '未編號訂單'), '：',
          case v_issue.issue_type
            when 'missing_fccd' then 'Shopify有單但FCCD尚未正式輸入'
            when 'unlinked_fccd' then 'FCCD訂單尚未連結Shopify'
            when 'factory_unsent' then '尚未傳送廚房'
            else '缺少出餐時間'
          end
        ),
        'order', v_issue.order_id, '/orders/' || v_issue.order_id,
        jsonb_build_object(
          'issueId', v_issue.id,
          'issueType', v_issue.issue_type,
          'serviceAt', v_issue.service_at,
          'orderId', v_issue.order_id,
          'customer', coalesce(v_issue.customer_name_snapshot, v_issue.company_name_snapshot)
        )
      );
    end loop;
  end loop;

  update public.business_notifications notice
  set resolved_at = p_now, updated_at = p_now
  where notice.event_type = 'order_reconciliation_urgent'
    and notice.resolved_at is null
    and not exists (
      select 1 from public.order_reconciliation_issues issue
      where issue.id = (notice.metadata ->> 'issueId')::uuid
        and issue.status = 'open' and issue.severity = 'urgent'
    );

  select count(*) into v_shopify_count from public.orders orders
  where orders.document_type = 'order' and orders.archived_at is null
    and orders.shopify_order_id is not null
    and orders.merged_into_order_id is null
    and (
      coalesce(orders.factory_date, orders.delivery_at) is null
      or (coalesce(orders.factory_date, orders.delivery_at) at time zone 'Asia/Hong_Kong')::date >= v_scope_start
    );
  select count(*) into v_fccd_count from public.orders orders
  where orders.document_type = 'order' and orders.archived_at is null
    and orders.shopify_order_id is not null
    and orders.source_system is distinct from 'shopify'
    and orders.merged_into_order_id is null
    and (
      coalesce(orders.factory_date, orders.delivery_at) is null
      or (coalesce(orders.factory_date, orders.delivery_at) at time zone 'Asia/Hong_Kong')::date >= v_scope_start
    );
  select count(*) filter (where issue_type = 'missing_fccd'),
    count(*) filter (where issue_type = 'unlinked_fccd'),
    count(*) filter (where issue_type = 'factory_unsent'),
    count(*) filter (where severity = 'urgent')
  into v_missing_count, v_unlinked_count, v_factory_count, v_urgent_count
  from public.order_reconciliation_issues where status = 'open';

  select coalesce(jsonb_agg(summary order by summary ->> 'store'), '[]'::jsonb)
  into v_store_summary
  from (
    select jsonb_build_object(
      'store', coalesce(store.shop_domain, '未連結店舖'),
      'shopify', count(*) filter (where orders.shopify_order_id is not null),
      'fccd', count(*) filter (where orders.shopify_order_id is not null and orders.source_system is distinct from 'shopify'),
      'missing', count(*) filter (where orders.source_system = 'shopify' and orders.shopify_order_id is not null)
    ) as summary
    from public.orders orders
    left join public.shopify_stores store on store.id = orders.shopify_store_id
    where orders.document_type = 'order' and orders.archived_at is null
      and orders.merged_into_order_id is null
      and (
        coalesce(orders.factory_date, orders.delivery_at) is null
        or (coalesce(orders.factory_date, orders.delivery_at) at time zone 'Asia/Hong_Kong')::date >= v_scope_start
      )
    group by store.shop_domain
  ) grouped;

  if v_daily then
    insert into public.order_reconciliation_runs (
      run_date, scope_start, shopify_count, fccd_matched_count,
      missing_fccd_count, unlinked_fccd_count, factory_unsent_count,
      urgent_count, store_summary, completed_at
    ) values (
      v_today, v_scope_start, v_shopify_count, v_fccd_count,
      v_missing_count, v_unlinked_count, v_factory_count,
      v_urgent_count, v_store_summary, p_now
    )
    on conflict (run_date) do update
    set scope_start = excluded.scope_start,
        shopify_count = excluded.shopify_count,
        fccd_matched_count = excluded.fccd_matched_count,
        missing_fccd_count = excluded.missing_fccd_count,
        unlinked_fccd_count = excluded.unlinked_fccd_count,
        factory_unsent_count = excluded.factory_unsent_count,
        urgent_count = excluded.urgent_count,
        store_summary = excluded.store_summary,
        completed_at = excluded.completed_at;
  end if;

  v_alerts := private.enqueue_order_reconciliation_alerts(p_now, v_daily);
  return jsonb_build_object(
    'daily', v_daily,
    'scopeStart', v_scope_start,
    'shopifyCount', v_shopify_count,
    'fccdCount', v_fccd_count,
    'missingCount', v_missing_count,
    'unlinkedCount', v_unlinked_count,
    'factoryUnsentCount', v_factory_count,
    'urgentCount', v_urgent_count,
    'alertsEnqueued', v_alerts
  );
end;
$$;

create or replace function public.claim_order_reconciliation_alerts(
  p_limit integer default 20
)
returns setof public.order_reconciliation_alert_outbox
language sql
security definer
set search_path = public
as $$
  update public.order_reconciliation_alert_outbox outbox
  set status = 'processing', attempts = outbox.attempts + 1,
      locked_at = now(), updated_at = now()
  where outbox.id in (
    select candidate.id
    from public.order_reconciliation_alert_outbox candidate
    where (
      candidate.status in ('pending', 'failed')
      or (candidate.status = 'processing' and candidate.locked_at < now() - interval '10 minutes')
    )
      and candidate.scheduled_at <= now() and candidate.attempts < 5
    order by candidate.scheduled_at, candidate.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  returning outbox.*;
$$;

revoke all on function public.refresh_order_reconciliation(timestamptz, boolean)
  from public, anon, authenticated;
revoke all on function public.claim_order_reconciliation_alerts(integer)
  from public, anon, authenticated;
grant execute on function public.refresh_order_reconciliation(timestamptz, boolean)
  to service_role;
grant execute on function public.claim_order_reconciliation_alerts(integer)
  to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_reconciliation_issues'
  ) then
    alter publication supabase_realtime add table public.order_reconciliation_issues;
  end if;
end;
$$;

-- Always remove previous copies first. Only a database with the explicit
-- production opt-in below may recreate these schedules.
select cron.unschedule(jobid)
from cron.job
where jobname = 'fccd-shopify-order-daily-reconciliation';

select cron.unschedule(jobid)
from cron.job
where jobname = 'fccd-order-reconciliation-alerts';

do $deployment$
begin
  if coalesce((
    select decrypted_secret from vault.decrypted_secrets
    where name = 'order_reconciliation_notifications_enabled' limit 1
  ), 'false') = 'true' then
    -- Refresh Shopify source data shortly before the 09:00 Hong Kong report.
    perform cron.schedule(
      'fccd-shopify-order-daily-reconciliation',
      '45 0 * * *',
      $cron$
        select net.http_post(
          url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/shopify-order-sync',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
              select decrypted_secret from vault.decrypted_secrets
              where name = 'bubble_daily_cron_secret' limit 1
            )
          ),
          body := jsonb_build_object(
            'mode', 'reconcile',
            'updated_at_min', to_char(
              (now() at time zone 'Asia/Hong_Kong') - interval '1 month',
              'YYYY-MM-DD"T"HH24:MI:SSOF'
            )
          ),
          timeout_milliseconds := 90000
        );
      $cron$
    );

    -- The isolated mode skips every customer-facing and unrelated queue.
    perform cron.schedule(
      'fccd-order-reconciliation-alerts',
      '* * * * *',
      $cron$
        select net.http_post(
          url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/wati-order-notifications',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
              select decrypted_secret from vault.decrypted_secrets
              where name = 'wati_order_cron_secret' limit 1
            )
          ),
          body := jsonb_build_object(
            'mode', 'reconciliation_only',
            'limit', 100
          ),
          timeout_milliseconds := 90000
        );
      $cron$
    );
  end if;
end;
$deployment$;
