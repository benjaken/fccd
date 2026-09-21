-- Learning state is environment-specific. A develop report must never mark the
-- same production date as learned (or vice versa).
begin;

drop function if exists public.customer_service_learning_import_summary(integer);

create function public.customer_service_learning_import_summary(
  p_limit integer,
  p_environment text
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
  if p_environment not in ('develop', 'production') then
    raise exception 'invalid_environment' using errcode = '22023';
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
      where reports.environment = p_environment
        and reports.status <> 'failed'
      group by reports.report_date
    ) learned_days
      on learned_days.report_date = (messages.created_at at time zone 'Asia/Hong_Kong')::date
    where messages.environment = p_environment
      and messages.phone_normalized not in ('8613828747224', '13828747224')
    group by 1, learned_days.report_date
    order by 1 desc
    limit greatest(1, least(coalesce(p_limit, 90), 365));
end;
$$;

revoke all on function public.customer_service_learning_import_summary(integer,text)
  from public, anon;
grant execute on function public.customer_service_learning_import_summary(integer,text)
  to authenticated;

commit;
