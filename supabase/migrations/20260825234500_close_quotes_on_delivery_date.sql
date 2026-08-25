create or replace function public.close_expired_quote_follow_ups(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  closed_count integer;
begin
  update public.orders
  set quote_status = 'Case Closed',
      quote_auto_closed_at = p_now,
      quote_close_reason = 'delivery_date_passed',
      updated_at = p_now
  where document_type = 'quote'
    and archived_at is null
    and delivery_at is not null
    and (quote_status is null or quote_status not in ('Done Deal', 'Case Closed'))
    and (delivery_at at time zone 'Asia/Hong_Kong')::date
      <= (p_now at time zone 'Asia/Hong_Kong')::date;

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

revoke all on function public.close_expired_quote_follow_ups(timestamptz)
  from public, anon, authenticated;

do $$
declare
  v_job bigint;
begin
  select jobid into v_job
  from cron.job
  where jobname = 'fccd-close-expired-quote-follow-ups';

  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
end
$$;

select cron.schedule(
  'fccd-close-expired-quote-follow-ups',
  '*/5 * * * *',
  $$select public.close_expired_quote_follow_ups()$$
);

select public.close_expired_quote_follow_ups();
