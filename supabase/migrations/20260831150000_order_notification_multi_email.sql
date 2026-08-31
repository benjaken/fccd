-- Allow one FCCD user to receive internal order notifications at multiple
-- email addresses without creating duplicate login accounts.

create table if not exists public.order_email_notification_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_email_notification_addresses_email_present
    check (nullif(btrim(email), '') is not null),
  constraint order_email_notification_addresses_email_shape
    check (btrim(email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create unique index if not exists order_email_notification_addresses_user_email_key
  on public.order_email_notification_addresses (user_id, lower(btrim(email)));

alter table public.order_email_notification_addresses enable row level security;
revoke all on table public.order_email_notification_addresses from public, anon, authenticated;

create or replace function private.order_email_notification_recipients()
returns table (
  user_id uuid,
  recipient_key text,
  recipient_name text,
  recipient_address text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select profile.id,
    profile.id::text,
    coalesce(nullif(btrim(profile.user_name), ''), btrim(profile.email)),
    btrim(profile.email)
  from public.user_profiles profile
  where profile.email_noti
    and nullif(btrim(profile.email), '') is not null

  union all

  select profile.id,
    profile.id::text || ':extra:' || address.id::text,
    coalesce(nullif(btrim(profile.user_name), ''), btrim(profile.email)),
    btrim(address.email)
  from public.user_profiles profile
  join public.order_email_notification_addresses address
    on address.user_id = profile.id
  where profile.email_noti
    and lower(btrim(address.email)) <> lower(btrim(coalesce(profile.email, '')));
$$;

revoke all on function private.order_email_notification_recipients()
  from public, anon, authenticated;

drop function if exists public.order_email_notification_user_list();
create function public.order_email_notification_user_list()
returns table (
  user_id uuid,
  user_name text,
  email text,
  enabled boolean,
  additional_emails jsonb
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.has_page_access('orders.settings.email_notifications') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return query
  select profile.id,
    coalesce(nullif(btrim(profile.user_name), ''), nullif(btrim(profile.email), ''), '—'),
    profile.email,
    coalesce(profile.email_noti, false),
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', address.id, 'email', btrim(address.email))
        order by lower(btrim(address.email)), address.id
      )
      from public.order_email_notification_addresses address
      where address.user_id = profile.id
    ), '[]'::jsonb)
  from public.user_profiles profile
  where nullif(btrim(profile.email), '') is not null
  order by lower(coalesce(nullif(btrim(profile.user_name), ''), profile.email)), profile.id;
end;
$$;

drop function if exists public.set_order_email_notification_user(uuid, boolean);
create function public.set_order_email_notification_user(
  p_user_id uuid,
  p_enabled boolean
)
returns table (
  user_id uuid,
  user_name text,
  email text,
  enabled boolean,
  additional_emails jsonb
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.has_page_manage('orders.settings.email_notifications') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;

  update public.user_profiles profile
  set email_noti = coalesce(p_enabled, false),
      updated_at = now()
  where profile.id = p_user_id
    and nullif(btrim(profile.email), '') is not null;

  if not found then
    raise exception 'notification_user_not_found' using errcode = 'P0002';
  end if;

  return query
  select profile.id,
    coalesce(nullif(btrim(profile.user_name), ''), nullif(btrim(profile.email), ''), '—'),
    profile.email,
    coalesce(profile.email_noti, false),
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', address.id, 'email', btrim(address.email))
        order by lower(btrim(address.email)), address.id
      )
      from public.order_email_notification_addresses address
      where address.user_id = profile.id
    ), '[]'::jsonb)
  from public.user_profiles profile
  where profile.id = p_user_id;
end;
$$;

create or replace function public.save_order_email_notification_address(
  p_user_id uuid,
  p_email text
)
returns table (id uuid, user_id uuid, email text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.has_page_manage('orders.settings.email_notifications') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if not exists (select 1 from public.user_profiles profile where profile.id = p_user_id) then
    raise exception 'notification_user_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.user_profiles profile
    where profile.id = p_user_id and lower(btrim(coalesce(profile.email, ''))) = v_email
  ) then
    raise exception 'notification_email_already_primary' using errcode = '23505';
  end if;

  return query
  insert into public.order_email_notification_addresses as address (user_id, email)
  values (p_user_id, v_email)
  on conflict (user_id, lower(btrim(email))) do update
    set updated_at = now()
  returning address.id, address.user_id, btrim(address.email);
end;
$$;

create or replace function public.delete_order_email_notification_address(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.has_page_manage('orders.settings.email_notifications') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;

  delete from public.order_email_notification_addresses address
  where address.id = p_id;
end;
$$;

revoke all on function public.order_email_notification_user_list() from public, anon;
revoke all on function public.set_order_email_notification_user(uuid, boolean) from public, anon;
revoke all on function public.save_order_email_notification_address(uuid, text) from public, anon;
revoke all on function public.delete_order_email_notification_address(uuid) from public, anon;
grant execute on function public.order_email_notification_user_list() to authenticated;
grant execute on function public.set_order_email_notification_user(uuid, boolean) to authenticated;
grant execute on function public.save_order_email_notification_address(uuid, text) to authenticated;
grant execute on function public.delete_order_email_notification_address(uuid) to authenticated;

create or replace function private.enqueue_internal_order_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.document_type <> 'order' or new.archived_at is not null then
    update public.order_internal_notification_outbox
    set status = 'skipped', last_error = 'order_not_active', locked_at = null, updated_at = now()
    where order_id = new.id and sent_at is null and status in ('pending', 'processing', 'failed');
    return new;
  end if;

  if coalesce(new.is_sent_to_factory, false) or coalesce(new.do_not_send_to_factory, false) then
    update public.order_internal_notification_outbox
    set status = 'skipped',
        last_error = case when coalesce(new.is_sent_to_factory, false)
          then 'factory_already_sent' else 'factory_send_not_required' end,
        locked_at = null, updated_at = now()
    where order_id = new.id and sent_at is null and status in ('pending', 'processing', 'failed');
    return new;
  end if;

  insert into public.order_internal_notification_outbox (
    order_id, channel, recipient_key, recipient_name, recipient_address, scheduled_at
  )
  select new.id, 'email', recipient.recipient_key, recipient.recipient_name,
    recipient.recipient_address, now()
  from private.order_email_notification_recipients() recipient
  on conflict (order_id, channel, recipient_key) do update
  set scheduled_at = now(), status = 'pending', last_error = null,
      locked_at = null, updated_at = now()
  where order_internal_notification_outbox.sent_at is null;

  insert into public.order_internal_notification_outbox (
    order_id, channel, recipient_key, recipient_name, recipient_address, scheduled_at
  )
  select new.id, 'whatsapp', recipient.id::text, recipient.name, recipient.phone, now()
  from public.order_first_notification_recipients recipient
  on conflict (order_id, channel, recipient_key) do update
  set scheduled_at = now(), status = 'pending', last_error = null,
      locked_at = null, updated_at = now()
  where order_internal_notification_outbox.sent_at is null;

  return new;
end;
$$;

create or replace function public.enqueue_driver_assignment_internal_reminders(p_reminder_date date)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_inserted integer;
  v_whatsapp_inserted integer;
begin
  if p_reminder_date is null then
    raise exception 'reminder_date_required' using errcode = '22004';
  end if;

  insert into public.driver_assignment_internal_reminder_outbox (
    reminder_date, channel, recipient_key, recipient_name, recipient_address
  )
  select p_reminder_date, 'email', recipient.recipient_key,
    recipient.recipient_name, recipient.recipient_address
  from private.order_email_notification_recipients() recipient
  on conflict (reminder_date, channel, recipient_key) do nothing;
  get diagnostics v_inserted = row_count;

  insert into public.driver_assignment_internal_reminder_outbox (
    reminder_date, channel, recipient_key, recipient_name, recipient_address
  )
  select p_reminder_date, 'whatsapp', recipient.id::text, recipient.name, recipient.phone
  from public.order_first_notification_recipients recipient
  on conflict (reminder_date, channel, recipient_key) do nothing;
  get diagnostics v_whatsapp_inserted = row_count;

  return v_inserted + v_whatsapp_inserted;
end;
$$;

revoke all on function public.enqueue_driver_assignment_internal_reminders(date)
  from public, anon, authenticated;
grant execute on function public.enqueue_driver_assignment_internal_reminders(date)
  to service_role;

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
      recipient.recipient_key, recipient.recipient_name, recipient.recipient_address
    from private.order_email_notification_recipients() recipient
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
    'urgent', 'email', recipient.recipient_key,
    recipient.recipient_name, recipient.recipient_address
  from public.order_reconciliation_issues issue
  cross join private.order_email_notification_recipients() recipient
  where issue.status = 'open' and issue.severity = 'urgent'
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
