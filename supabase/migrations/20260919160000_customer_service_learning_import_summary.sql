-- Per-day summary of backfilled WATI history so the settings page can show what
-- was imported and let an operator trigger learning for each day.
create or replace function public.customer_service_learning_import_summary(
  p_limit integer default 90
)
returns table (
  import_date date,
  message_count bigint,
  human_count bigint,
  customer_count bigint
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
      count(*) as message_count,
      count(*) filter (where messages.role = 'human') as human_count,
      count(*) filter (where messages.role = 'customer') as customer_count
     from public.customer_service_learning_import_messages messages
     group by 1})
    order by 1 desc
    limit greatest(1, least(coalesce(p_limit, 90), 365));
end;
$$;

revoke all on function public.customer_service_learning_import_summary(integer)
  from public, anon;
grant execute on function public.customer_service_learning_import_summary(integer)
  to authenticated;
