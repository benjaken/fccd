-- Server-side cache for the data-input-progress report.  The client reads only
-- compact period summaries; it never needs to download all historical records.
create materialized view public.data_input_progress_cache as
select
  'monthly_costs'::text as source,
  (date_trunc('month', month_at at time zone 'Asia/Hong_Kong'))::date as period_start,
  count(*)::integer as entered_count,
  count(*)::integer as required_count
from public.monthly_costs
where month_at is not null
  and month_at < date_trunc('year', current_date)::date
group by 1, 2

union all

select
  'bank_settlements'::text as source,
  (date_trunc('month', payment_at at time zone 'Asia/Hong_Kong'))::date as period_start,
  (count(*) filter (where payout_at is not null))::integer as entered_count,
  count(*)::integer as required_count
from public.payments
where voided_at is null
  and payment_at is not null
  and payment_at < date_trunc('year', current_date)::date
group by 1, 2

union all

select
  'packing_stocktakes'::text as source,
  (stocktake_at at time zone 'Asia/Hong_Kong')::date as period_start,
  (count(*) filter (where quantity is not null))::integer as entered_count,
  count(*)::integer as required_count
from public.packing_stocktake_events
where stocktake_at is not null
  and stocktake_at < date_trunc('year', current_date)::date
group by 1, 2

union all

select
  'weekly_advertising'::text as source,
  (range_start at time zone 'Asia/Hong_Kong')::date as period_start,
  count(*)::integer as entered_count,
  count(*)::integer as required_count
from public.advertising_costs
where range_start is not null
  and range_start < date_trunc('year', current_date)::date
group by 1, 2;

create unique index data_input_progress_cache_source_period_idx
  on public.data_input_progress_cache (source, period_start);

create or replace function public.get_data_input_progress_cache()
returns table (
  source text,
  period_start date,
  entered_count integer,
  required_count integer
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('reports.data_input_progress') then
    raise exception 'insufficient_privilege';
  end if;

  return query
  select cache.source, cache.period_start, cache.entered_count, cache.required_count
  from public.data_input_progress_cache cache
  order by cache.source, cache.period_start desc;
end;
$$;

revoke all on function public.get_data_input_progress_cache() from public;
grant execute on function public.get_data_input_progress_cache() to authenticated;

-- The current year is deliberately not cached.  It is calculated at request
-- time so the progress page immediately reflects newly entered data.
create or replace function public.get_data_input_progress_current_year()
returns table (
  source text,
  period_start date,
  entered_count integer,
  required_count integer
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('reports.data_input_progress') then
    raise exception 'insufficient_privilege';
  end if;

  return query
  select
    'monthly_costs'::text,
    (date_trunc('month', monthly_costs.month_at at time zone 'Asia/Hong_Kong'))::date,
    count(*)::integer,
    count(*)::integer
  from public.monthly_costs
  where monthly_costs.month_at >= date_trunc('year', current_date)::date
  group by 1, 2

  union all

  select
    'bank_settlements'::text,
    (date_trunc('month', payments.payment_at at time zone 'Asia/Hong_Kong'))::date,
    (count(*) filter (where payments.payout_at is not null))::integer,
    count(*)::integer
  from public.payments
  where payments.voided_at is null
    and payments.payment_at >= date_trunc('year', current_date)::date
  group by 1, 2

  union all

  select
    'packing_stocktakes'::text,
    (packing_stocktake_events.stocktake_at at time zone 'Asia/Hong_Kong')::date,
    (count(*) filter (where packing_stocktake_events.quantity is not null))::integer,
    count(*)::integer
  from public.packing_stocktake_events
  where packing_stocktake_events.stocktake_at >= date_trunc('year', current_date)::date
  group by 1, 2

  union all

  select
    'weekly_advertising'::text,
    (advertising_costs.range_start at time zone 'Asia/Hong_Kong')::date,
    count(*)::integer,
    count(*)::integer
  from public.advertising_costs
  where advertising_costs.range_start >= date_trunc('year', current_date)::date
  group by 1, 2

  order by 1, 2 desc;
end;
$$;

revoke all on function public.get_data_input_progress_current_year() from public;
grant execute on function public.get_data_input_progress_current_year() to authenticated;

-- Source data is updated infrequently. Refresh at 08:35, 14:35, 20:35 and
-- 02:35 Hong Kong time; the daily Bubble sync has completed before 08:35.
select cron.schedule(
  'fccd-data-input-progress-cache-refresh',
  '35 */6 * * *',
  $$refresh materialized view concurrently public.data_input_progress_cache$$
);
