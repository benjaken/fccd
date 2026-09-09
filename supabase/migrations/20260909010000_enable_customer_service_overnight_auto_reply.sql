-- Enable WhatsApp customer-service auto replies overnight in Hong Kong time.
-- An empty allowlist means the bot can reply to any customer on the channel.

update public.customer_service_controls
set
  bot_enabled = true,
  allowed_phones = '{}'::text[],
  auto_reply_start = '19:00',
  auto_reply_end = '09:00',
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
      and cardinality(allowed_phones) = 0
      and auto_reply_start = time '19:00'
      and auto_reply_end = time '09:00'
      and auto_reply_timezone = 'Asia/Hong_Kong'
  ) then
    raise exception 'customer_service_overnight_auto_reply_not_enabled';
  end if;
end;
$$;
