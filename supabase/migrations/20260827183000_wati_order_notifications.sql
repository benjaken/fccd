-- Reliable WATI WhatsApp notifications for customer-facing order events.
-- Templates are seeded disabled: enable each row only after the matching
-- template has been approved in WATI and its parameter names are confirmed.

-- Production already provisions pg_cron and pg_net. Reusing the managed
-- extensions avoids rerunning Supabase's extension privilege bootstrap.

create table public.wati_order_notification_templates (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (event_key in (
    'delivery_order_confirmed',
    'pickup_order_confirmed',
    'delivery_tomorrow_reminder',
    'pickup_tomorrow_reminder',
    'delivery_today_reminder',
    'pickup_today_reminder',
    'order_details_updated',
    'delivery_dispatched',
    'pickup_ready',
    'order_completed',
    'order_cancelled'
  )),
  template_name text not null,
  broadcast_name text not null,
  parameters jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wati_template_parameters_array check (jsonb_typeof(parameters) = 'array')
);

comment on table public.wati_order_notification_templates is
  'Approved WATI template names and ordered parameter-to-order-field mappings.';

create table public.wati_order_status_event_rules (
  id uuid primary key default gen_random_uuid(),
  source_field text not null check (source_field in ('delivery_status', 'order_status')),
  status_value text not null,
  event_key text not null references public.wati_order_notification_templates(event_key)
    on update cascade on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_field, status_value, event_key)
);

comment on table public.wati_order_status_event_rules is
  'Maps a delivery_status value or order_statuses.legacy_id to a customer notification event.';

create table public.wati_order_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  template_id uuid not null references public.wati_order_notification_templates(id),
  event_key text not null,
  occurrence_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  recipient_phone text,
  rendered_parameters jsonb,
  wati_message_id text,
  wati_sent_at timestamptz,
  wati_skipped_at timestamptz,
  wati_provider_response jsonb,
  email_sent_at timestamptz,
  email_skipped_at timestamptz,
  email_provider_response jsonb,
  wati_error text,
  email_error text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, template_id, occurrence_key)
);

create index wati_order_notification_outbox_pending_idx
  on public.wati_order_notification_outbox(next_attempt_at, created_at)
  where status in ('pending', 'failed');

alter table public.wati_order_notification_templates enable row level security;
alter table public.wati_order_status_event_rules enable row level security;
alter table public.wati_order_notification_outbox enable row level security;

revoke all on public.wati_order_notification_templates from anon, authenticated;
revoke all on public.wati_order_status_event_rules from anon, authenticated;
revoke all on public.wati_order_notification_outbox from anon, authenticated;

insert into public.wati_order_notification_templates
  (event_key, template_name, broadcast_name, parameters)
values
  ('delivery_order_confirmed', 'delivery_order_confirmation', 'delivery_order_confirmation',
   '[{"name":"name","source":"name"},{"name":"order_number","source":"order_number"},{"name":"date","source":"date"},{"name":"time","source":"time"},{"name":"address","source":"address"},{"name":"ao_deadline","source":"ao_deadline"},{"name":"ao_link","source":"ao_link"},{"name":"shop_name","source":"shop_name"}]'),
  ('pickup_order_confirmed', 'pickup_order_confirmation', 'pickup_order_confirmation',
   '[{"name":"name","source":"name"},{"name":"order_number","source":"order_number"},{"name":"date","source":"date"},{"name":"time","source":"time"}]'),
  ('delivery_tomorrow_reminder', 'delivery_tomorrow_reminder', 'delivery_tomorrow_reminder',
   '[{"name":"name","source":"name"},{"name":"order_number","source":"order_number"},{"name":"date","source":"date"},{"name":"time","source":"time"},{"name":"address","source":"address"},{"name":"shop_name","source":"shop_name"}]'),
  ('pickup_tomorrow_reminder', 'pickup_tomorrow_reminder', 'pickup_tomorrow_reminder',
   '[{"name":"name","source":"name"},{"name":"order_number","source":"order_number"},{"name":"date","source":"date"},{"name":"time","source":"time"},{"name":"shop_name","source":"shop_name"}]'),
  ('delivery_today_reminder', 'delivery_today_reminder', 'delivery_today_reminder',
   '[{"name":"name","source":"name"},{"name":"order_number","source":"order_number"},{"name":"date","source":"date"},{"name":"time","source":"time"},{"name":"address","source":"address"},{"name":"shop_name","source":"shop_name"}]'),
  ('pickup_today_reminder', 'pickup_today_reminder', 'pickup_today_reminder',
   '[{"name":"name","source":"name"},{"name":"order_number","source":"order_number"},{"name":"date","source":"date"},{"name":"time","source":"time"},{"name":"shop_name","source":"shop_name"}]'),
  ('order_details_updated', 'order_details_updated', 'order_details_updated',
   '[{"name":"name","source":"name"},{"name":"order_number","source":"order_number"},{"name":"date","source":"date"},{"name":"time","source":"time"},{"name":"delivery_method","source":"delivery_method"},{"name":"address","source":"address"},{"name":"shop_name","source":"shop_name"}]'),
  ('delivery_dispatched', 'delivery_dispatched', 'delivery_dispatched',
   '[{"name":"name","source":"name"},{"name":"order_number","source":"order_number"},{"name":"time","source":"time"},{"name":"address","source":"address"},{"name":"shop_name","source":"shop_name"}]'),
  ('pickup_ready', 'pickup_ready', 'pickup_ready',
   '[{"name":"name","source":"name"},{"name":"order_number","source":"order_number"},{"name":"date","source":"date"},{"name":"time","source":"time"},{"name":"shop_name","source":"shop_name"}]'),
  ('order_completed', 'order_completed', 'order_completed',
   '[{"name":"name","source":"name"},{"name":"order_number","source":"order_number"},{"name":"shop_name","source":"shop_name"}]'),
  ('order_cancelled', 'order_cancelled', 'order_cancelled',
   '[{"name":"name","source":"name"},{"name":"order_number","source":"order_number"},{"name":"date","source":"date"},{"name":"time","source":"time"},{"name":"shop_name","source":"shop_name"}]')
on conflict (event_key) do nothing;

-- Known delivery lifecycle values. Operational order-status rules (for example
-- the legacy id used for "ready for pickup") can be added after confirming the
-- production catalog value.
insert into public.wati_order_status_event_rules (source_field, status_value, event_key)
values
  ('delivery_status', '送貨途中', 'delivery_dispatched'),
  ('delivery_status', '已送達', 'order_completed'),
  ('delivery_status', '已取消', 'order_cancelled')
on conflict do nothing;

create or replace function private.wati_delivery_method(p_order public.orders)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_method public.shipping_methods%rowtype;
begin
  select * into v_method
  from public.shipping_methods
  where id = p_order.shipping_method_id;

  if coalesce(v_method.requires_address_check, true) = false
     or coalesce(v_method.name, '') ~* '(自取|pickup)'
     or coalesce(v_method.display_name, '') ~* '(自取|pickup)'
  then
    return 'pickup';
  end if;
  return 'delivery';
end;
$$;

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

create or replace function private.capture_wati_order_events()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_method text;
  v_rule record;
  v_occurrence text := txid_current()::text;
begin
  if tg_op = 'INSERT' then
    if new.document_type = 'order' and new.archived_at is null then
      v_method := private.wati_delivery_method(new);
      perform private.enqueue_wati_order_event(
        new.id,
        case when v_method = 'pickup' then 'pickup_order_confirmed' else 'delivery_order_confirmed' end,
        'confirmed'
      );
    end if;
    return new;
  end if;

  if new.document_type <> 'order' or new.archived_at is not null then
    if old.archived_at is null and new.archived_at is not null then
      perform private.enqueue_wati_order_event(new.id, 'order_cancelled', 'cancelled');
    end if;
    return new;
  end if;

  v_method := private.wati_delivery_method(new);

  if old.document_type is distinct from new.document_type then
    perform private.enqueue_wati_order_event(
      new.id,
      case when v_method = 'pickup' then 'pickup_order_confirmed' else 'delivery_order_confirmed' end,
      'confirmed'
    );
  elsif old.delivery_at is distinct from new.delivery_at
     or old.delivery_time is distinct from new.delivery_time
     or old.shipping_address_snapshot is distinct from new.shipping_address_snapshot
     or old.shipping_method_id is distinct from new.shipping_method_id
  then
    perform private.enqueue_wati_order_event(new.id, 'order_details_updated', 'details:' || v_occurrence);
  end if;

  if old.delivery_status is distinct from new.delivery_status then
    for v_rule in
      select rule.event_key
      from public.wati_order_status_event_rules rule
      where rule.is_active
        and rule.source_field = 'delivery_status'
        and rule.status_value = coalesce(new.delivery_status, '')
    loop
      perform private.enqueue_wati_order_event(new.id, v_rule.event_key,
        case when v_rule.event_key = 'order_cancelled' then 'cancelled'
          else 'delivery-status:' || coalesce(new.delivery_status, '') || ':' || v_occurrence end
      );
    end loop;
  end if;

  if old.order_status_legacy_ids is distinct from new.order_status_legacy_ids then
    for v_rule in
      select rule.event_key, rule.status_value
      from public.wati_order_status_event_rules rule
      where rule.is_active
        and rule.source_field = 'order_status'
        and rule.status_value = any(coalesce(new.order_status_legacy_ids, '{}'::text[]))
        and not (rule.status_value = any(coalesce(old.order_status_legacy_ids, '{}'::text[])))
    loop
      perform private.enqueue_wati_order_event(
        new.id, v_rule.event_key, 'order-status:' || v_rule.status_value || ':' || v_occurrence
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists capture_wati_order_events on public.orders;
create trigger capture_wati_order_events
after insert or update of document_type, archived_at, delivery_at, delivery_time,
  shipping_address_snapshot, shipping_method_id, delivery_status, order_status_legacy_ids
on public.orders
for each row execute function private.capture_wati_order_events();

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
    if (v_order.delivery_at at time zone 'Asia/Hong_Kong')::date = v_local_date then
      v_event_key := case private.wati_delivery_method(v_order)
        when 'pickup' then 'pickup_today_reminder'
        else 'delivery_today_reminder'
      end;
    else
      v_event_key := case private.wati_delivery_method(v_order)
        when 'pickup' then 'pickup_tomorrow_reminder'
        else 'delivery_tomorrow_reminder'
      end;
    end if;

    v_count := v_count + private.enqueue_wati_order_event(
      v_order.id,
      v_event_key,
      v_event_key || ':' || (v_order.delivery_at at time zone 'Asia/Hong_Kong')::date::text
    );
  end loop;
  return v_count;
end;
$$;

revoke all on function public.enqueue_due_wati_order_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_due_wati_order_reminders(timestamptz) to service_role;

create or replace function public.claim_wati_order_notifications(p_limit integer default 20)
returns setof public.wati_order_notification_outbox
language sql
security definer
set search_path = public
as $$
  update public.wati_order_notification_outbox outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      locked_at = now(),
      updated_at = now()
  where outbox.id in (
    select candidate.id
    from public.wati_order_notification_outbox candidate
    where (
        candidate.status in ('pending', 'failed')
        or (candidate.status = 'processing' and candidate.locked_at < now() - interval '10 minutes')
      )
      and candidate.next_attempt_at <= now()
      and candidate.attempts < 5
    order by candidate.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  returning outbox.*;
$$;

revoke all on function public.claim_wati_order_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_wati_order_notifications(integer) to service_role;

-- The Edge Function validates this Vault secret against WATI_ORDER_CRON_SECRET.
-- It also calls enqueue_due_wati_order_reminders, so one job handles both
-- scheduled reminders and status-triggered outbox delivery.
do $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'fccd-wati-order-notifications';
  if v_job is not null then perform cron.unschedule(v_job); end if;
end;
$$;

select cron.schedule(
  'fccd-wati-order-notifications',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/wati-order-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'wati_order_cron_secret'
          limit 1
        )
      ),
      body := '{"limit":20}'::jsonb,
      timeout_milliseconds := 50000
    );
  $$
);
