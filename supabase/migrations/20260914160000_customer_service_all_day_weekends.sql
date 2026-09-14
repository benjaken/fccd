begin;

alter table public.customer_service_controls
  alter column saturday_auto_reply_start set default '00:00',
  alter column saturday_auto_reply_end set default '00:00',
  alter column sunday_auto_reply_start set default '00:00',
  alter column sunday_auto_reply_end set default '00:00';

update public.customer_service_controls
set
  weekday_auto_reply_start = '19:00',
  weekday_auto_reply_end = '09:00',
  saturday_auto_reply_start = '00:00',
  saturday_auto_reply_end = '00:00',
  sunday_auto_reply_start = '00:00',
  sunday_auto_reply_end = '00:00',
  auto_reply_start = '19:00',
  auto_reply_end = '09:00',
  weekend_auto_reply_start = '00:00',
  weekend_auto_reply_end = '00:00',
  auto_reply_timezone = 'Asia/Hong_Kong',
  updated_at = now()
where id = 'global';

commit;
