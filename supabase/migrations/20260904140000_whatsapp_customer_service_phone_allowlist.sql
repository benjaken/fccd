-- Optional inbound allowlist for WhatsApp customer-service bot.
-- Empty array means no extra phone restriction. Does not alter wati_notification_controls.

alter table public.customer_service_controls
  add column if not exists allowed_phones text[] not null default '{}';

drop function if exists public.customer_service_controls_get();
drop function if exists public.customer_service_controls_set(boolean);

create or replace function public.customer_service_controls_get()
returns table (
  bot_enabled boolean,
  allowed_phones text[],
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if auth.role() is distinct from 'service_role'
     and not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
    select controls.bot_enabled, controls.allowed_phones, controls.updated_at
    from public.customer_service_controls controls
    where controls.id = 'global';
end;
$$;

create or replace function public.customer_service_controls_set(p_bot_enabled boolean)
returns table (
  bot_enabled boolean,
  allowed_phones text[],
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  update public.customer_service_controls
  set
    bot_enabled = p_bot_enabled,
    updated_at = now(),
    updated_by = auth.uid()
  where id = 'global';
  return query select * from public.customer_service_controls_get();
end;
$$;

grant execute on function public.customer_service_controls_get() to authenticated, service_role;
grant execute on function public.customer_service_controls_set(boolean) to authenticated;
