create extension if not exists pg_cron with schema pg_catalog;

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
  with candidates as (
    select
      orders.id,
      orders.delivery_at,
      regexp_match(
        coalesce(orders.ship_out_time, ''),
        '([01]?[0-9]|2[0-3]):([0-5][0-9])'
      ) as time_parts
    from public.orders
    where orders.document_type = 'quote'
      and orders.archived_at is null
      and orders.delivery_at is not null
      and nullif(btrim(orders.ship_out_time), '') is not null
      and (
        orders.quote_status is null
        or orders.quote_status not in ('Done Deal', 'Case Closed')
      )
  ),
  expired as (
    select candidates.id
    from candidates
    where candidates.time_parts is not null
      and (
        (candidates.delivery_at at time zone 'Asia/Hong_Kong')::date
        + make_time(
          candidates.time_parts[1]::integer,
          candidates.time_parts[2]::integer,
          0
        )
      ) <= (p_now at time zone 'Asia/Hong_Kong')
  )
  update public.orders
  set
    quote_status = 'Case Closed',
    updated_at = p_now
  from expired
  where orders.id = expired.id;

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

comment on function public.close_expired_quote_follow_ups(timestamptz) is
  'Closes open, unarchived quotes after their Hong Kong dispatch date and ship-out time. The first valid HH:MM in legacy time ranges is used.';

revoke all on function public.close_expired_quote_follow_ups(timestamptz) from public;
revoke all on function public.close_expired_quote_follow_ups(timestamptz) from anon;
revoke all on function public.close_expired_quote_follow_ups(timestamptz) from authenticated;

-- Apply the rule immediately to existing rows when this migration is deployed.
select public.close_expired_quote_follow_ups();

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'fccd-close-expired-quote-follow-ups';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

-- pg_cron uses UTC, but the function performs the comparison in Hong Kong time.
select cron.schedule(
  'fccd-close-expired-quote-follow-ups',
  '*/5 * * * *',
  $$select public.close_expired_quote_follow_ups()$$
);
