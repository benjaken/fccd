-- Daily internal email and WATI reminder for delivery orders that still have no fleet
-- assigned. The Edge worker snapshots the live order list immediately before
-- sending so every included FCCD link reflects the current assignment state.

create table public.driver_assignment_internal_reminder_outbox (
  id uuid primary key default gen_random_uuid(),
  reminder_date date not null,
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
  unique (reminder_date, channel, recipient_key)
);

create index driver_assignment_internal_reminder_outbox_pending_idx
  on public.driver_assignment_internal_reminder_outbox (scheduled_at, created_at)
  where status in ('pending', 'failed');

alter table public.driver_assignment_internal_reminder_outbox enable row level security;
revoke all on public.driver_assignment_internal_reminder_outbox from anon, authenticated;
grant all on public.driver_assignment_internal_reminder_outbox to service_role;

create or replace function public.enqueue_driver_assignment_internal_reminders(
  p_reminder_date date
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

  insert into public.driver_assignment_internal_reminder_outbox (
    reminder_date, channel, recipient_key, recipient_name, recipient_address
  )
  select
    p_reminder_date,
    'email',
    profile.id::text,
    coalesce(nullif(btrim(profile.user_name), ''), profile.email),
    btrim(profile.email)
  from public.user_profiles as profile
  where profile.email_noti
    and nullif(btrim(profile.email), '') is not null
  on conflict (reminder_date, channel, recipient_key) do nothing;

  get diagnostics v_inserted = row_count;

  insert into public.driver_assignment_internal_reminder_outbox (
    reminder_date, channel, recipient_key, recipient_name, recipient_address
  )
  select
    p_reminder_date,
    'whatsapp',
    recipient.id::text,
    recipient.name,
    recipient.phone
  from public.order_first_notification_recipients as recipient
  on conflict (reminder_date, channel, recipient_key) do nothing;

  get diagnostics v_whatsapp_inserted = row_count;
  v_inserted := v_inserted + v_whatsapp_inserted;
  return v_inserted;
end;
$$;

create or replace function public.claim_driver_assignment_internal_reminders(
  p_limit integer default 20
)
returns setof public.driver_assignment_internal_reminder_outbox
language sql
security definer
set search_path = public
as $$
  update public.driver_assignment_internal_reminder_outbox as outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      locked_at = now(),
      updated_at = now()
  where outbox.id in (
    select candidate.id
    from public.driver_assignment_internal_reminder_outbox as candidate
    where (
        candidate.status in ('pending', 'failed')
        or (
          candidate.status = 'processing'
          and candidate.locked_at < now() - interval '10 minutes'
        )
      )
      and candidate.scheduled_at <= now()
      and candidate.attempts < 5
    order by candidate.scheduled_at, candidate.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  returning outbox.*;
$$;

revoke all on function public.enqueue_driver_assignment_internal_reminders(date)
  from public, anon, authenticated;
revoke all on function public.claim_driver_assignment_internal_reminders(integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_driver_assignment_internal_reminders(date)
  to service_role;
grant execute on function public.claim_driver_assignment_internal_reminders(integer)
  to service_role;
