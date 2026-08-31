-- Runtime WATI controls managed from Order Settings. Defaults are fail-closed
-- so non-production projects never start sending merely by applying this migration.

create table if not exists public.wati_notification_controls (
  id text primary key default 'global' check (id = 'global'),
  automatic_notifications_enabled boolean not null default false,
  automatic_email_notifications_enabled boolean not null default false,
  manual_order_confirmation_enabled boolean not null default false,
  manual_order_confirmation_email_enabled boolean not null default false,
  manual_quote_confirmation_enabled boolean not null default false,
  manual_quote_confirmation_email_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.wati_notification_controls (id)
values ('global')
on conflict (id) do nothing;

alter table public.wati_notification_controls enable row level security;
revoke all on public.wati_notification_controls from anon, authenticated;
grant all on public.wati_notification_controls to service_role;

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values (
  'orders.settings.wati_notifications',
  'WATI 通知',
  '/orders/settings/wati-notifications',
  30,
  true,
  'orders.settings',
  'page'
)
on conflict (page_key) do update
set display_name = excluded.display_name,
    route = excluded.route,
    sort_order = excluded.sort_order,
    is_high_risk = excluded.is_high_risk,
    parent_page_key = excluded.parent_page_key,
    page_kind = excluded.page_kind,
    updated_at = now();

with parent_permissions as (
  select role, can_access, can_manage
  from public.role_page_permissions
  where page_key = 'orders.settings'
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select role, 'orders.settings.wati_notifications', can_access, can_manage
from parent_permissions
on conflict (role, page_key) do update
set can_access = excluded.can_access,
    can_manage = excluded.can_manage,
    updated_at = now();

create or replace function public.wati_notification_controls_get()
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
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('orders.settings.wati_notifications') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return query
  select controls.automatic_notifications_enabled,
    controls.automatic_email_notifications_enabled,
    controls.manual_order_confirmation_enabled,
    controls.manual_order_confirmation_email_enabled,
    controls.manual_quote_confirmation_enabled,
    controls.manual_quote_confirmation_email_enabled,
    controls.updated_at
  from public.wati_notification_controls as controls
  where controls.id = 'global';
end;
$$;

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
  if coalesce(p_control, '') not in (
    'automatic_notifications',
    'automatic_email_notifications',
    'manual_order_confirmation',
    'manual_order_confirmation_email',
    'manual_quote_confirmation',
    'manual_quote_confirmation_email'
  ) then
    raise exception 'wati_notification_control_invalid' using errcode = '22023';
  end if;

  update public.wati_notification_controls as controls
  set automatic_notifications_enabled = case
        when p_control = 'automatic_notifications' then coalesce(p_enabled, false)
        else controls.automatic_notifications_enabled
      end,
      manual_order_confirmation_enabled = case
        when p_control = 'manual_order_confirmation' then coalesce(p_enabled, false)
        else controls.manual_order_confirmation_enabled
      end,
      automatic_email_notifications_enabled = case
        when p_control = 'automatic_email_notifications' then coalesce(p_enabled, false)
        else controls.automatic_email_notifications_enabled
      end,
      manual_order_confirmation_email_enabled = case
        when p_control = 'manual_order_confirmation_email' then coalesce(p_enabled, false)
        else controls.manual_order_confirmation_email_enabled
      end,
      manual_quote_confirmation_enabled = case
        when p_control = 'manual_quote_confirmation' then coalesce(p_enabled, false)
        else controls.manual_quote_confirmation_enabled
      end,
      manual_quote_confirmation_email_enabled = case
        when p_control = 'manual_quote_confirmation_email' then coalesce(p_enabled, false)
        else controls.manual_quote_confirmation_email_enabled
      end,
      updated_at = now(),
      updated_by = auth.uid()
  where controls.id = 'global';

  return query
  select controls.automatic_notifications_enabled,
    controls.automatic_email_notifications_enabled,
    controls.manual_order_confirmation_enabled,
    controls.manual_order_confirmation_email_enabled,
    controls.manual_quote_confirmation_enabled,
    controls.manual_quote_confirmation_email_enabled,
    controls.updated_at
  from public.wati_notification_controls as controls
  where controls.id = 'global';
end;
$$;

revoke all on function public.wati_notification_controls_get() from public, anon;
revoke all on function public.wati_notification_control_set(text, boolean) from public, anon;
grant execute on function public.wati_notification_controls_get() to authenticated, service_role;
grant execute on function public.wati_notification_control_set(text, boolean) to authenticated, service_role;
