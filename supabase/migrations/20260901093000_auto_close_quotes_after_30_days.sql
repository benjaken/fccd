-- Keep every quote open for the Hong Kong calendar day on which it was
-- created plus the following 29 days. Once it leaves that 30-day window
-- without becoming Done Deal, close it as unsuccessful. The existing
-- five-minute cron job calls this function.

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
      quote_close_reason = case
        when delivery_at is not null
          and (delivery_at at time zone 'Asia/Hong_Kong')::date
            <= (p_now at time zone 'Asia/Hong_Kong')::date
          then 'delivery_date_passed'
        else 'quote_30_days_elapsed'
      end,
      updated_at = p_now
  where document_type = 'quote'
    and archived_at is null
    and (quote_status is null or quote_status not in ('Done Deal', 'Case Closed'))
    and (
      (
        delivery_at is not null
        and (delivery_at at time zone 'Asia/Hong_Kong')::date
          <= (p_now at time zone 'Asia/Hong_Kong')::date
      )
      or (
        (effective_created_at at time zone 'Asia/Hong_Kong')::date
          < (p_now at time zone 'Asia/Hong_Kong')::date - 29
      )
    );

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

comment on function public.close_expired_quote_follow_ups(timestamptz) is
  'Closes open quotes when their Hong Kong delivery date arrives or when they leave their 30-day quote window.';

revoke all on function public.close_expired_quote_follow_ups(timestamptz)
  from public, anon, authenticated;

-- Apply the rule immediately to existing quotes when deployed. The existing
-- fccd-close-expired-quote-follow-ups cron job handles future rows.
select public.close_expired_quote_follow_ups();
