-- Customer email blocklist. Matching addresses are not sent customer mail
-- such as same-day delivery reminders. WhatsApp is unchanged.

alter table public.notification_recipient_policy
  add column if not exists blocked_emails text[] not null default '{}'::text[];

drop function if exists public.notification_control_center_get();

create function public.notification_control_center_get()
returns table (
  automatic_notifications_enabled boolean,
  automatic_email_notifications_enabled boolean,
  recipient_mode text,
  allowed_wati_phones text[],
  allowed_emails text[],
  blocked_emails text[],
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
    policy.blocked_emails,
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

drop function if exists public.notification_recipient_policy_set(text, text[], text[]);

create function public.notification_recipient_policy_set(
  p_recipient_mode text,
  p_allowed_wati_phones text[],
  p_allowed_emails text[],
  p_blocked_emails text[] default null
)
returns setof public.notification_recipient_policy
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_phones text[];
  v_emails text[];
  v_blocked text[];
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

  if p_blocked_emails is null then
    select policy.blocked_emails into v_blocked
    from public.notification_recipient_policy policy
    where policy.singleton;
  else
    select coalesce(array_agg(distinct lower(btrim(value)))
      filter (where lower(btrim(value)) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'), '{}'::text[])
    into v_blocked
    from unnest(p_blocked_emails) value;
  end if;

  if p_recipient_mode = 'allowlist'
     and cardinality(v_phones) = 0
     and cardinality(v_emails) = 0 then
    raise exception 'notification_allowlist_empty' using errcode = '22023';
  end if;

  update public.notification_recipient_policy policy
  set recipient_mode = p_recipient_mode,
      allowed_wati_phones = v_phones,
      allowed_emails = v_emails,
      blocked_emails = coalesce(v_blocked, '{}'::text[]),
      updated_at = now(),
      updated_by = auth.uid()
  where policy.singleton;

  return query select policy.*
  from public.notification_recipient_policy policy
  where policy.singleton;
end;
$$;

revoke all on function public.notification_control_center_get() from public, anon;
revoke all on function public.notification_recipient_policy_set(text, text[], text[], text[]) from public, anon;
grant execute on function public.notification_control_center_get() to authenticated, service_role;
grant execute on function public.notification_recipient_policy_set(text, text[], text[], text[]) to authenticated, service_role;
