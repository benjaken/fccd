-- Read-only audit feed for notifications that were actually sent automatically.
-- Existing outbox tables remain the source of truth, so this also exposes
-- historical sends without duplicating provider payloads.

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values (
  'settings.wati_email_logs',
  'WATI／郵件發送記錄',
  '/settings/wati-email-logs',
  126,
  false,
  'settings',
  'subpage'
)
on conflict (page_key) do update
set display_name = excluded.display_name,
    route = excluded.route,
    sort_order = excluded.sort_order,
    is_high_risk = excluded.is_high_risk,
    parent_page_key = excluded.parent_page_key,
    page_kind = excluded.page_kind,
    updated_at = now();

insert into public.role_page_permissions (role, page_key, can_access, can_manage)
values
  ('Super Admin', 'settings.wati_email_logs', true, false),
  ('Admin', 'settings.wati_email_logs', true, false)
on conflict (role, page_key) do update
set can_access = excluded.can_access,
    can_manage = excluded.can_manage,
    updated_at = now();

create or replace function public.wati_email_send_log_list(
  p_offset integer default 0,
  p_limit integer default 15,
  p_search text default null,
  p_channel text default null
)
returns table (
  log_id text,
  sent_at timestamptz,
  channel text,
  event_key text,
  template_name text,
  recipient_name text,
  recipient_address text,
  order_number text,
  detail jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.wati_email_logs') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  if coalesce(p_channel, '') not in ('', 'wati', 'email') then
    raise exception 'send_log_channel_invalid' using errcode = '22023';
  end if;

  return query
  with sent_logs as (
    select
      outbox.id::text || ':' || delivery.channel as log_id,
      delivery.sent_at,
      delivery.channel,
      outbox.event_key,
      case when delivery.channel = 'wati' then template.template_name else null end as template_name,
      coalesce(nullif(btrim(orders.customer_name_snapshot), ''), nullif(btrim(orders.company_name_snapshot), '')) as recipient_name,
      case when delivery.channel = 'wati' then outbox.recipient_phone else orders.email_snapshot end as recipient_address,
      orders.order_number,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'order_notification',
        'parameters', outbox.rendered_parameters,
        'provider_message_id', case when delivery.channel = 'wati' then outbox.wati_message_id else null end
      )) as detail
    from public.wati_order_notification_outbox as outbox
    join public.wati_order_notification_templates as template on template.id = outbox.template_id
    join public.orders as orders on orders.id = outbox.order_id
    cross join lateral (values
      ('wati'::text, outbox.wati_sent_at),
      ('email'::text, outbox.email_sent_at)
    ) as delivery(channel, sent_at)
    where delivery.sent_at is not null
      and outbox.event_key not in (
        'driver_assigned', 'bad_weather_notice', 'holiday_service_notice',
        'second_contact_requested', 'payment_instructions_sent',
        'payment_confirmed', 'delivery_delayed', 'order_issue_reported'
      )

    union all

    select
      outbox.id::text,
      outbox.sent_at,
      case outbox.channel when 'whatsapp' then 'wati' else 'email' end,
      'internal_order_notification',
      null::text,
      outbox.recipient_name,
      outbox.recipient_address,
      orders.order_number,
      jsonb_build_object('source', 'internal_order_notification')
    from public.order_internal_notification_outbox as outbox
    join public.orders as orders on orders.id = outbox.order_id
    where outbox.status = 'sent' and outbox.sent_at is not null

    union all

    select
      outbox.id::text,
      outbox.sent_at,
      case outbox.channel when 'whatsapp' then 'wati' else 'email' end,
      'driver_assignment_reminder',
      null::text,
      outbox.recipient_name,
      outbox.recipient_address,
      null::text,
      jsonb_build_object('source', 'driver_assignment_reminder', 'reminder_date', outbox.reminder_date)
    from public.driver_assignment_internal_reminder_outbox as outbox
    where outbox.status = 'sent' and outbox.sent_at is not null

    union all

    select
      outbox.id::text,
      outbox.sent_at,
      case outbox.channel when 'whatsapp' then 'wati' else 'email' end,
      outbox.event_key,
      null::text,
      outbox.recipient_name,
      outbox.recipient_address,
      orders.order_number,
      jsonb_build_object('source', 'order_reconciliation_alert', 'cycle_key', outbox.cycle_key)
    from public.order_reconciliation_alert_outbox as outbox
    left join public.order_reconciliation_issues as issue on issue.id = outbox.issue_id
    left join public.orders as orders on orders.id = issue.order_id
    where outbox.status = 'sent' and outbox.sent_at is not null
  ), filtered as (
    select logs.*
    from sent_logs as logs
    where (coalesce(p_channel, '') = '' or logs.channel = p_channel)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or coalesce(logs.recipient_name, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(logs.recipient_address, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(logs.order_number, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(logs.event_key, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(logs.template_name, '') ilike '%' || btrim(p_search) || '%'
      )
  )
  select
    filtered.log_id,
    filtered.sent_at,
    filtered.channel,
    filtered.event_key,
    filtered.template_name,
    filtered.recipient_name,
    filtered.recipient_address,
    filtered.order_number,
    filtered.detail,
    count(*) over () as total_count
  from filtered
  order by filtered.sent_at desc, filtered.log_id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 15), 1), 100);
end;
$$;

revoke all on function public.wati_email_send_log_list(integer, integer, text, text)
  from public, anon;
grant execute on function public.wati_email_send_log_list(integer, integer, text, text)
  to authenticated, service_role;
