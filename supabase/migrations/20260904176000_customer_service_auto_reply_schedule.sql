-- Configure the daily WhatsApp customer-service auto-reply window.
-- The master switch must be enabled and the current Hong Kong time must be
-- inside this window. A start later than the end represents an overnight span.

alter table public.customer_service_controls
  add column if not exists auto_reply_start time not null default '19:00',
  add column if not exists auto_reply_end time not null default '09:00',
  add column if not exists auto_reply_timezone text not null default 'Asia/Hong_Kong';

-- Temporary develop setting: equal start/end means the bot is available all day.
-- Operations can change this to 19:00-09:00 from the settings page after testing.
update public.customer_service_controls
set bot_enabled = true, auto_reply_start = '00:00', auto_reply_end = '00:00'
where id = 'global';

drop function if exists public.customer_service_controls_get();
drop function if exists public.customer_service_controls_set(boolean);
drop function if exists public.customer_service_controls_set(boolean, time, time);

create or replace function public.customer_service_controls_get()
returns table (
  bot_enabled boolean,
  allowed_phones text[],
  auto_reply_start time,
  auto_reply_end time,
  auto_reply_timezone text,
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
    select
      controls.bot_enabled,
      controls.allowed_phones,
      controls.auto_reply_start,
      controls.auto_reply_end,
      controls.auto_reply_timezone,
      controls.updated_at
    from public.customer_service_controls controls
    where controls.id = 'global';
end;
$$;

create or replace function public.customer_service_controls_set(
  p_bot_enabled boolean,
  p_auto_reply_start time,
  p_auto_reply_end time
)
returns table (
  bot_enabled boolean,
  allowed_phones text[],
  auto_reply_start time,
  auto_reply_end time,
  auto_reply_timezone text,
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
    auto_reply_start = p_auto_reply_start,
    auto_reply_end = p_auto_reply_end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = 'global';
  return query select * from public.customer_service_controls_get();
end;
$$;

revoke all on function public.customer_service_controls_get() from public, anon;
revoke all on function public.customer_service_controls_set(boolean, time, time) from public, anon;
grant execute on function public.customer_service_controls_get() to authenticated, service_role;
grant execute on function public.customer_service_controls_set(boolean, time, time) to authenticated;
