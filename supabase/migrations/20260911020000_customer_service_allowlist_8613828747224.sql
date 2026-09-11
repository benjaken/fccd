-- Supabase develop-branch pilot: allowlist one WhatsApp number and keep the
-- all-day auto-reply window (equal start/end = 00:00).
-- Do not treat this as the production overnight schedule (19:00–09:00 HKT).

update public.customer_service_controls
set
  bot_enabled = true,
  allowed_phones = array['8613828747224']::text[],
  auto_reply_start = '00:00',
  auto_reply_end = '00:00',
  auto_reply_timezone = 'Asia/Hong_Kong',
  updated_at = now()
where id = 'global';

do $$
begin
  if not exists (
    select 1
    from public.customer_service_controls
    where id = 'global'
      and bot_enabled
      and allowed_phones = array['8613828747224']::text[]
      and auto_reply_start = time '00:00'
      and auto_reply_end = time '00:00'
      and auto_reply_timezone = 'Asia/Hong_Kong'
  ) then
    raise exception 'customer_service_allowlist_8613828747224_not_applied';
  end if;
end;
$$;
