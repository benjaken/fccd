-- "One-click learn recent dates" should not re-analyse a day that has already
-- been learned. A day counts as learned once a daily learning report exists for
-- it and did not fail outright, so the summary now exposes that flag and the UI
-- can skip those days.

drop function if exists public.customer_service_learning_import_summary(integer);

create function public.customer_service_learning_import_summary(
  p_limit integer default 90
)
returns table (
  import_date date,
  message_count bigint,
  human_count bigint,
  customer_count bigint,
  broadcast_count bigint,
  learned boolean
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
    select
      (messages.created_at at time zone 'Asia/Hong_Kong')::date as import_date,
      count(*) filter (where not messages.is_broadcast) as message_count,
      count(*) filter (where not messages.is_broadcast and messages.role = 'human') as human_count,
      count(*) filter (where not messages.is_broadcast and messages.role = 'customer') as customer_count,
      count(*) filter (where messages.is_broadcast) as broadcast_count,
      learned_days.report_date is not null as learned
    from public.customer_service_learning_import_messages messages
    left join (
      select reports.report_date
      from public.customer_service_daily_reports reports
      where reports.status <> 'failed'
      group by reports.report_date
    ) learned_days
      on learned_days.report_date = (messages.created_at at time zone 'Asia/Hong_Kong')::date
    where messages.phone_normalized not in ('8613828747224', '13828747224')
    group by 1, learned_days.report_date
    order by 1 desc
    limit greatest(1, least(coalesce(p_limit, 90), 365));
end;
$$;

revoke all on function public.customer_service_learning_import_summary(integer)
  from public, anon;
grant execute on function public.customer_service_learning_import_summary(integer)
  to authenticated;
