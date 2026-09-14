-- Manual quote confirmations are no longer part of the notification workflow.
-- Keep the legacy columns for backwards-compatible RPC return types, but force
-- them off and reject attempts from older clients to re-enable them.

update public.wati_notification_controls
set
  manual_quote_confirmation_enabled = false,
  manual_quote_confirmation_email_enabled = false,
  updated_at = now()
where id = 'global';

create or replace function public.wati_notification_control_set(
  p_control text,
  p_enabled boolean
)
returns table (
  automatic_notifications_enabled boolean,
  automatic_email_notifications_enabled boolean,
  manual_order_confirmation_enabled boolean,
  manual_order_confirmation_email_enabled boolean,
  manual_quote_confirmation_enabled boolean,
  manual_quote_confirmation_email_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_manage('orders.settings.wati_notifications') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if p_control not in (
    'automatic_notifications',
    'automatic_email_notifications',
    'manual_order_confirmation',
    'manual_order_confirmation_email'
  ) then
    raise exception 'wati_notification_control_invalid' using errcode = '22023';
  end if;

  update public.wati_notification_controls controls
  set
    automatic_notifications_enabled = case
      when p_control = 'automatic_notifications' then coalesce(p_enabled, false)
      else controls.automatic_notifications_enabled
    end,
    automatic_email_notifications_enabled = case
      when p_control = 'automatic_email_notifications' then coalesce(p_enabled, false)
      else controls.automatic_email_notifications_enabled
    end,
    manual_order_confirmation_enabled = case
      when p_control = 'manual_order_confirmation' then coalesce(p_enabled, false)
      else controls.manual_order_confirmation_enabled
    end,
    manual_order_confirmation_email_enabled = case
      when p_control = 'manual_order_confirmation_email' then coalesce(p_enabled, false)
      else controls.manual_order_confirmation_email_enabled
    end,
    manual_quote_confirmation_enabled = false,
    manual_quote_confirmation_email_enabled = false,
    updated_by = auth.uid(),
    updated_at = now()
  where controls.id = 'global';

  return query
  select
    controls.automatic_notifications_enabled,
    controls.automatic_email_notifications_enabled,
    controls.manual_order_confirmation_enabled,
    controls.manual_order_confirmation_email_enabled,
    controls.manual_quote_confirmation_enabled,
    controls.manual_quote_confirmation_email_enabled,
    controls.updated_at
  from public.wati_notification_controls controls
  where controls.id = 'global';
end;
$$;

revoke all on function public.wati_notification_control_set(text, boolean)
  from public, anon;
grant execute on function public.wati_notification_control_set(text, boolean)
  to authenticated, service_role;
