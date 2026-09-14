-- Unified controls for every outbound WATI and email notification surface.
-- Existing channel and template states are preserved; applying this migration
-- never enables a notification that is currently disabled.

update public.app_pages
set display_name = case page_key
  when 'orders.settings.email_notifications' then '郵件通知人設定'
  when 'orders.settings.first_notification_recipients' then 'WATI 通知人設定'
  else display_name
end
where page_key in (
  'orders.settings.email_notifications',
  'orders.settings.first_notification_recipients'
);

create table if not exists public.notification_recipient_policy (
  singleton boolean primary key default true check (singleton),
  recipient_mode text not null default 'environment'
    check (recipient_mode in ('environment', 'allowlist', 'live')),
  allowed_wati_phones text[] not null default array['8613828747224']::text[],
  allowed_emails text[] not null default array['cfb.app02@chifung.net']::text[],
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.notification_recipient_policy (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.notification_delivery_controls (
  notification_key text primary key,
  wati_enabled boolean not null default false,
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.notification_delivery_controls (
  notification_key, wati_enabled, email_enabled
)
values
  ('delivery_today_reminder', false, true),
  ('pickup_today_reminder', false, true),
  ('manual_order_confirmation', true, true),
  ('factory_unsent_reminder', true, true),
  ('driver_assignment_reminder', false, true),
  ('order_reconciliation', true, true),
  ('enquiry_internal', true, true),
  ('enquiry_customer_ack', false, true),
  ('inventory_email_alerts', false, false),
  ('daily_sales_report', false, true),
  ('manual_wati_utility', true, false)
on conflict (notification_key) do nothing;

-- Mirror the states that already control provider delivery.
update public.notification_delivery_controls controls
set wati_enabled = template.is_active,
    updated_at = now()
from public.wati_order_notification_templates template
where (controls.notification_key, template.event_key) in (
  ('delivery_today_reminder', 'delivery_today_reminder'),
  ('pickup_today_reminder', 'pickup_today_reminder'),
  ('driver_assignment_reminder', 'driver_assigned')
);

update public.notification_delivery_controls controls
set wati_enabled = global_controls.manual_order_confirmation_enabled,
    email_enabled = global_controls.manual_order_confirmation_email_enabled,
    updated_at = now()
from public.wati_notification_controls global_controls
where controls.notification_key = 'manual_order_confirmation'
  and global_controls.id = 'global';

update public.notification_delivery_controls controls
set email_enabled = inventory.shortage_notifications_enabled,
    updated_at = now()
from public.inventory_notification_controls inventory
where controls.notification_key = 'inventory_email_alerts'
  and inventory.singleton;

alter table public.notification_recipient_policy enable row level security;
alter table public.notification_delivery_controls enable row level security;
revoke all on public.notification_recipient_policy from public, anon, authenticated;
revoke all on public.notification_delivery_controls from public, anon, authenticated;
grant all on public.notification_recipient_policy to service_role;
grant all on public.notification_delivery_controls to service_role;

create or replace function public.notification_control_center_get()
returns table (
  automatic_notifications_enabled boolean,
  automatic_email_notifications_enabled boolean,
  recipient_mode text,
  allowed_wati_phones text[],
  allowed_emails text[],
  event_controls jsonb,
  template_states jsonb,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('orders.settings.wati_notifications') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return query
  select
    global_controls.automatic_notifications_enabled,
    global_controls.automatic_email_notifications_enabled,
    policy.recipient_mode,
    policy.allowed_wati_phones,
    policy.allowed_emails,
    coalesce((
      select jsonb_object_agg(
        delivery.notification_key,
        jsonb_build_object(
          'watiEnabled', delivery.wati_enabled,
          'emailEnabled', delivery.email_enabled
        ) order by delivery.notification_key
      )
      from public.notification_delivery_controls delivery
    ), '{}'::jsonb),
    coalesce((
      select jsonb_object_agg(
        template.event_key,
        jsonb_build_object(
          'templateName', template.template_name,
          'active', template.is_active,
          'parameterCount', jsonb_array_length(template.parameters)
        ) order by template.event_key
      )
      from public.wati_order_notification_templates template
    ), '{}'::jsonb),
    greatest(global_controls.updated_at, policy.updated_at)
  from public.wati_notification_controls global_controls
  cross join public.notification_recipient_policy policy
  where global_controls.id = 'global' and policy.singleton;
end;
$$;

create or replace function public.notification_delivery_control_set(
  p_notification_key text,
  p_channel text,
  p_enabled boolean
)
returns setof public.notification_delivery_controls
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_supported boolean;
begin
  if not private.has_page_manage('orders.settings.wati_notifications') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if coalesce(p_channel, '') not in ('wati', 'email') then
    raise exception 'notification_channel_invalid' using errcode = '22023';
  end if;

  v_supported := case p_notification_key
    when 'delivery_today_reminder' then true
    when 'pickup_today_reminder' then true
    when 'manual_order_confirmation' then true
    when 'factory_unsent_reminder' then true
    when 'driver_assignment_reminder' then true
    when 'order_reconciliation' then true
    when 'enquiry_internal' then true
    when 'enquiry_customer_ack' then p_channel = 'email'
    when 'inventory_email_alerts' then p_channel = 'email'
    when 'daily_sales_report' then p_channel = 'email'
    when 'manual_wati_utility' then p_channel = 'wati'
    else false
  end;
  if not v_supported then
    raise exception 'notification_control_invalid' using errcode = '22023';
  end if;

  update public.notification_delivery_controls controls
  set wati_enabled = case when p_channel = 'wati'
        then coalesce(p_enabled, false) else controls.wati_enabled end,
      email_enabled = case when p_channel = 'email'
        then coalesce(p_enabled, false) else controls.email_enabled end,
      updated_at = now(),
      updated_by = auth.uid()
  where controls.notification_key = p_notification_key;

  if not found then
    raise exception 'notification_control_missing' using errcode = 'P0002';
  end if;

  if p_channel = 'wati' then
    update public.wati_order_notification_templates template
    set is_active = coalesce(p_enabled, false), updated_at = now()
    where template.event_key = case p_notification_key
      when 'delivery_today_reminder' then 'delivery_today_reminder'
      when 'pickup_today_reminder' then 'pickup_today_reminder'
      when 'driver_assignment_reminder' then 'driver_assigned'
      else null
    end;
  end if;

  if p_notification_key = 'manual_order_confirmation' then
    update public.wati_notification_controls controls
    set manual_order_confirmation_enabled = case when p_channel = 'wati'
          then coalesce(p_enabled, false)
          else controls.manual_order_confirmation_enabled end,
        manual_order_confirmation_email_enabled = case when p_channel = 'email'
          then coalesce(p_enabled, false)
          else controls.manual_order_confirmation_email_enabled end,
        updated_at = now(),
        updated_by = auth.uid()
    where controls.id = 'global';
  end if;

  if p_notification_key = 'inventory_email_alerts' and p_channel = 'email' then
    update public.inventory_notification_controls controls
    set shortage_notifications_enabled = coalesce(p_enabled, false),
        updated_at = now(),
        updated_by = auth.uid()
    where controls.singleton;
  end if;

  return query
  select controls.*
  from public.notification_delivery_controls controls
  where controls.notification_key = p_notification_key;
end;
$$;

create or replace function public.notification_recipient_policy_set(
  p_recipient_mode text,
  p_allowed_wati_phones text[],
  p_allowed_emails text[]
)
returns setof public.notification_recipient_policy
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_phones text[];
  v_emails text[];
begin
  if not private.has_page_manage('orders.settings.wati_notifications') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if coalesce(p_recipient_mode, '') not in ('environment', 'allowlist', 'live') then
    raise exception 'notification_recipient_mode_invalid' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct regexp_replace(value, '\D', '', 'g'))
    filter (where regexp_replace(value, '\D', '', 'g') ~ '^\d{8,15}$'), '{}'::text[])
  into v_phones
  from unnest(coalesce(p_allowed_wati_phones, '{}'::text[])) value;

  select coalesce(array_agg(distinct lower(btrim(value)))
    filter (where lower(btrim(value)) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'), '{}'::text[])
  into v_emails
  from unnest(coalesce(p_allowed_emails, '{}'::text[])) value;

  if p_recipient_mode = 'allowlist'
     and cardinality(v_phones) = 0
     and cardinality(v_emails) = 0 then
    raise exception 'notification_allowlist_empty' using errcode = '22023';
  end if;

  update public.notification_recipient_policy policy
  set recipient_mode = p_recipient_mode,
      allowed_wati_phones = v_phones,
      allowed_emails = v_emails,
      updated_at = now(),
      updated_by = auth.uid()
  where policy.singleton;

  return query select policy.*
  from public.notification_recipient_policy policy
  where policy.singleton;
end;
$$;

revoke all on function public.notification_control_center_get() from public, anon;
revoke all on function public.notification_delivery_control_set(text, text, boolean) from public, anon;
revoke all on function public.notification_recipient_policy_set(text, text[], text[]) from public, anon;
grant execute on function public.notification_control_center_get() to authenticated, service_role;
grant execute on function public.notification_delivery_control_set(text, text, boolean) to authenticated, service_role;
grant execute on function public.notification_recipient_policy_set(text, text[], text[]) to authenticated, service_role;
