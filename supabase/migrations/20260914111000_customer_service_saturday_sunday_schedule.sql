-- Split the previous shared weekend auto-reply window into independently
-- configurable Saturday and Sunday windows. Existing weekend values are copied
-- to both days so rollout does not change current behaviour.

alter table public.customer_service_controls
  add column if not exists saturday_auto_reply_start time,
  add column if not exists saturday_auto_reply_end time,
  add column if not exists sunday_auto_reply_start time,
  add column if not exists sunday_auto_reply_end time;

update public.customer_service_controls as controls
set
  saturday_auto_reply_start = controls.weekend_auto_reply_start,
  saturday_auto_reply_end = controls.weekend_auto_reply_end,
  sunday_auto_reply_start = controls.weekend_auto_reply_start,
  sunday_auto_reply_end = controls.weekend_auto_reply_end
where controls.saturday_auto_reply_start is null
   or controls.saturday_auto_reply_end is null
   or controls.sunday_auto_reply_start is null
   or controls.sunday_auto_reply_end is null;

alter table public.customer_service_controls
  alter column saturday_auto_reply_start set default '19:00',
  alter column saturday_auto_reply_start set not null,
  alter column saturday_auto_reply_end set default '09:00',
  alter column saturday_auto_reply_end set not null,
  alter column sunday_auto_reply_start set default '19:00',
  alter column sunday_auto_reply_start set not null,
  alter column sunday_auto_reply_end set default '09:00',
  alter column sunday_auto_reply_end set not null;

drop function if exists public.customer_service_controls_set(boolean, time, time);
drop function if exists public.customer_service_controls_set(boolean, time, time, time, time);
drop function if exists public.customer_service_controls_set(boolean, time, time, time, time, time, time);
drop function if exists public.customer_service_controls_get();

create function public.customer_service_controls_get()
returns table (
  bot_enabled boolean,
  allowed_phones text[],
  auto_reply_start time,
  auto_reply_end time,
  weekday_auto_reply_start time,
  weekday_auto_reply_end time,
  weekend_auto_reply_start time,
  weekend_auto_reply_end time,
  saturday_auto_reply_start time,
  saturday_auto_reply_end time,
  sunday_auto_reply_start time,
  sunday_auto_reply_end time,
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
      controls.weekday_auto_reply_start,
      controls.weekday_auto_reply_end,
      controls.weekend_auto_reply_start,
      controls.weekend_auto_reply_end,
      controls.saturday_auto_reply_start,
      controls.saturday_auto_reply_end,
      controls.sunday_auto_reply_start,
      controls.sunday_auto_reply_end,
      controls.auto_reply_timezone,
      controls.updated_at
    from public.customer_service_controls controls
    where controls.id = 'global';
end;
$$;

-- Old clients that set one window still apply it to every day group.
create function public.customer_service_controls_set(
  p_bot_enabled boolean,
  p_auto_reply_start time,
  p_auto_reply_end time
)
returns table (
  bot_enabled boolean,
  allowed_phones text[],
  auto_reply_start time,
  auto_reply_end time,
  weekday_auto_reply_start time,
  weekday_auto_reply_end time,
  weekend_auto_reply_start time,
  weekend_auto_reply_end time,
  saturday_auto_reply_start time,
  saturday_auto_reply_end time,
  sunday_auto_reply_start time,
  sunday_auto_reply_end time,
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
    weekday_auto_reply_start = p_auto_reply_start,
    weekday_auto_reply_end = p_auto_reply_end,
    weekend_auto_reply_start = p_auto_reply_start,
    weekend_auto_reply_end = p_auto_reply_end,
    saturday_auto_reply_start = p_auto_reply_start,
    saturday_auto_reply_end = p_auto_reply_end,
    sunday_auto_reply_start = p_auto_reply_start,
    sunday_auto_reply_end = p_auto_reply_end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = 'global';
  return query select * from public.customer_service_controls_get();
end;
$$;

-- The previous weekday/weekend setter remains compatible and applies its
-- weekend value to both Saturday and Sunday.
create function public.customer_service_controls_set(
  p_bot_enabled boolean,
  p_weekday_auto_reply_start time,
  p_weekday_auto_reply_end time,
  p_weekend_auto_reply_start time,
  p_weekend_auto_reply_end time
)
returns table (
  bot_enabled boolean,
  allowed_phones text[],
  auto_reply_start time,
  auto_reply_end time,
  weekday_auto_reply_start time,
  weekday_auto_reply_end time,
  weekend_auto_reply_start time,
  weekend_auto_reply_end time,
  saturday_auto_reply_start time,
  saturday_auto_reply_end time,
  sunday_auto_reply_start time,
  sunday_auto_reply_end time,
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
    auto_reply_start = p_weekday_auto_reply_start,
    auto_reply_end = p_weekday_auto_reply_end,
    weekday_auto_reply_start = p_weekday_auto_reply_start,
    weekday_auto_reply_end = p_weekday_auto_reply_end,
    weekend_auto_reply_start = p_weekend_auto_reply_start,
    weekend_auto_reply_end = p_weekend_auto_reply_end,
    saturday_auto_reply_start = p_weekend_auto_reply_start,
    saturday_auto_reply_end = p_weekend_auto_reply_end,
    sunday_auto_reply_start = p_weekend_auto_reply_start,
    sunday_auto_reply_end = p_weekend_auto_reply_end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = 'global';
  return query select * from public.customer_service_controls_get();
end;
$$;

-- New clients can configure the three day groups independently.
create function public.customer_service_controls_set(
  p_bot_enabled boolean,
  p_weekday_auto_reply_start time,
  p_weekday_auto_reply_end time,
  p_saturday_auto_reply_start time,
  p_saturday_auto_reply_end time,
  p_sunday_auto_reply_start time,
  p_sunday_auto_reply_end time
)
returns table (
  bot_enabled boolean,
  allowed_phones text[],
  auto_reply_start time,
  auto_reply_end time,
  weekday_auto_reply_start time,
  weekday_auto_reply_end time,
  weekend_auto_reply_start time,
  weekend_auto_reply_end time,
  saturday_auto_reply_start time,
  saturday_auto_reply_end time,
  sunday_auto_reply_start time,
  sunday_auto_reply_end time,
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
    auto_reply_start = p_weekday_auto_reply_start,
    auto_reply_end = p_weekday_auto_reply_end,
    weekday_auto_reply_start = p_weekday_auto_reply_start,
    weekday_auto_reply_end = p_weekday_auto_reply_end,
    weekend_auto_reply_start = p_saturday_auto_reply_start,
    weekend_auto_reply_end = p_saturday_auto_reply_end,
    saturday_auto_reply_start = p_saturday_auto_reply_start,
    saturday_auto_reply_end = p_saturday_auto_reply_end,
    sunday_auto_reply_start = p_sunday_auto_reply_start,
    sunday_auto_reply_end = p_sunday_auto_reply_end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = 'global';
  return query select * from public.customer_service_controls_get();
end;
$$;

revoke all on function public.customer_service_controls_get() from public, anon;
revoke all on function public.customer_service_controls_set(boolean, time, time) from public, anon;
revoke all on function public.customer_service_controls_set(boolean, time, time, time, time) from public, anon;
revoke all on function public.customer_service_controls_set(boolean, time, time, time, time, time, time) from public, anon;
grant execute on function public.customer_service_controls_get() to authenticated, service_role;
grant execute on function public.customer_service_controls_set(boolean, time, time) to authenticated;
grant execute on function public.customer_service_controls_set(boolean, time, time, time, time) to authenticated;
grant execute on function public.customer_service_controls_set(boolean, time, time, time, time, time, time) to authenticated;
