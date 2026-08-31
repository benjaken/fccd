-- Stage (but do not activate) the internal unassigned-driver reminder for the
-- day before delivery at 09:00, 12:00, 15:00, 18:00 and 21:00 Hong Kong time.

alter table public.driver_assignment_internal_reminder_outbox
  add column if not exists reminder_hour smallint not null default 9
    check (reminder_hour between 0 and 23);

alter table public.driver_assignment_internal_reminder_outbox
  drop constraint if exists driver_assignment_internal_reminder_outbox_reminder_date_channel_recipient_key_key;

alter table public.driver_assignment_internal_reminder_outbox
  add constraint driver_assignment_internal_reminder_outbox_slot_recipient_key
  unique (reminder_date, reminder_hour, channel, recipient_key);

drop function if exists public.enqueue_driver_assignment_internal_reminders(date);

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
  if p_reminder_hour not in (9, 12, 15, 18, 21) then
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

revoke all on function public.enqueue_driver_assignment_internal_reminders(date, smallint)
  from public, anon, authenticated;
grant execute on function public.enqueue_driver_assignment_internal_reminders(date, smallint)
  to service_role;

update public.wati_order_notification_templates
set is_active = false,
    updated_at = now()
where event_key = 'driver_assigned';
