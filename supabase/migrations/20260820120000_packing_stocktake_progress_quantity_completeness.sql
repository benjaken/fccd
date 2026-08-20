-- Rebuild the server-side progress cache so packing stocktake completion means
-- every item on that dated sheet has a quantity, not merely that a sheet exists.
create materialized view public.data_input_progress_cache_v2 as
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
  'bank_settlements'::text,
  (date_trunc('month', payment_at at time zone 'Asia/Hong_Kong'))::date,
  (count(*) filter (where payout_at is not null))::integer,
  count(*)::integer
from public.payments
where voided_at is null
  and payment_at is not null
  and payment_at < date_trunc('year', current_date)::date
group by 1, 2

union all

select
  'packing_stocktakes'::text,
  (stocktake_at at time zone 'Asia/Hong_Kong')::date,
  (count(*) filter (where quantity is not null))::integer,
  count(*)::integer
from public.packing_stocktake_events
where stocktake_at is not null
  and stocktake_at < date_trunc('year', current_date)::date
group by 1, 2

union all

select
  'weekly_advertising'::text,
  (range_start at time zone 'Asia/Hong_Kong')::date,
  count(*)::integer,
  count(*)::integer
from public.advertising_costs
where range_start is not null
  and range_start < date_trunc('year', current_date)::date
group by 1, 2;

create unique index data_input_progress_cache_v2_source_period_idx
  on public.data_input_progress_cache_v2 (source, period_start);

create or replace function public.get_data_input_progress_cache()
returns table (source text, period_start date, entered_count integer, required_count integer)
language plpgsql security definer set search_path = public, private
as $$
begin
  if not private.has_page_access('reports.data_input_progress') then raise exception 'insufficient_privilege'; end if;
  return query select cache.source, cache.period_start, cache.entered_count, cache.required_count
  from public.data_input_progress_cache_v2 cache order by cache.source, cache.period_start desc;
end;
$$;

create or replace function public.get_data_input_progress_current_year()
returns table (source text, period_start date, entered_count integer, required_count integer)
language plpgsql security definer set search_path = public, private
as $$
begin
  if not private.has_page_access('reports.data_input_progress') then raise exception 'insufficient_privilege'; end if;
  return query
  select 'monthly_costs'::text, (date_trunc('month', month_at at time zone 'Asia/Hong_Kong'))::date, count(*)::integer, count(*)::integer from public.monthly_costs where month_at >= date_trunc('year', current_date)::date group by 1,2
  union all
  select 'bank_settlements'::text, (date_trunc('month', payment_at at time zone 'Asia/Hong_Kong'))::date, (count(*) filter (where payout_at is not null))::integer, count(*)::integer from public.payments where voided_at is null and payment_at >= date_trunc('year', current_date)::date group by 1,2
  union all
  select 'packing_stocktakes'::text, (stocktake_at at time zone 'Asia/Hong_Kong')::date, (count(*) filter (where quantity is not null))::integer, count(*)::integer from public.packing_stocktake_events where stocktake_at >= date_trunc('year', current_date)::date group by 1,2
  union all
  select 'weekly_advertising'::text, (range_start at time zone 'Asia/Hong_Kong')::date, count(*)::integer, count(*)::integer from public.advertising_costs where range_start >= date_trunc('year', current_date)::date group by 1,2
  order by 1,2 desc;
end;
$$;

select cron.unschedule('fccd-data-input-progress-cache-refresh');
select cron.schedule('fccd-data-input-progress-cache-refresh', '35 */6 * * *', $$refresh materialized view concurrently public.data_input_progress_cache_v2$$);
