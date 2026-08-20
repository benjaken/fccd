-- Central-kitchen advertising-performance report.
-- Sales are grouped by the order's festival, or by delivery month when the
-- order is not assigned to a festival. Advertising amounts come from the
-- monthly festival/non-peak cost inputs and are grouped by linked channels.

create or replace function public.report_kitchen_advertising_performance()
returns table (
  segment_type text,
  segment_key text,
  segment_label text,
  report_year integer,
  channel_name text,
  metric_name text,
  amount numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with festival_sales as (
    select
      'festival'::text as segment_type,
      coalesce(f.name, o.festival_legacy_id, '未分類節日') as segment_key,
      coalesce(f.name, o.festival_legacy_id, '未分類節日') as segment_label,
      extract(year from o.delivery_at at time zone 'Asia/Hong_Kong')::integer as report_year,
      coalesce(nullif(btrim(c.name), ''), 'Unassigned') as channel_name,
      'Sales'::text as metric_name,
      sum(coalesce(o.grand_total, 0))::numeric as amount
    from public.orders o
    left join public.festivals f
      on f.id = o.festival_id
      or (o.festival_id is null and f.legacy_id = o.festival_legacy_id)
    left join public.channels c
      on c.id = o.channel_id
      or (o.channel_id is null and c.legacy_id = o.channel_legacy_id)
    where o.document_type = 'order'
      and o.archived_at is null
      and o.delivery_at is not null
      and coalesce(f.name, o.festival_legacy_id, '') <> ''
    group by 1, 2, 3, 4, 5, 6
  ),
  non_peak_sales as (
    select
      'non_peak'::text as segment_type,
      extract(month from o.delivery_at at time zone 'Asia/Hong_Kong')::integer::text as segment_key,
      concat(extract(month from o.delivery_at at time zone 'Asia/Hong_Kong')::integer, '月 non-peak') as segment_label,
      extract(year from o.delivery_at at time zone 'Asia/Hong_Kong')::integer as report_year,
      coalesce(nullif(btrim(c.name), ''), 'Unassigned') as channel_name,
      'Sales'::text as metric_name,
      sum(coalesce(o.grand_total, 0))::numeric as amount
    from public.orders o
    left join public.channels c
      on c.id = o.channel_id
      or (o.channel_id is null and c.legacy_id = o.channel_legacy_id)
    where o.document_type = 'order'
      and o.archived_at is null
      and o.delivery_at is not null
      and o.festival_id is null
      and nullif(btrim(o.festival_legacy_id), '') is null
    group by 1, 2, 3, 4, 5, 6
  ),
  festival_costs as (
    select
      'festival'::text as segment_type,
      coalesce(nullif(btrim(f.name), ''), mc.festival_legacy_id, '未分類節日') as segment_key,
      coalesce(nullif(btrim(f.name), ''), mc.festival_legacy_id, '未分類節日') as segment_label,
      extract(year from coalesce(mc.festival_range_start, mc.month_at) at time zone 'Asia/Hong_Kong')::integer as report_year,
      coalesce(nullif(btrim(c.name), ''), 'Unassigned') as channel_name,
      coalesce(nullif(btrim(ct.name), ''), 'Advertising') as metric_name,
      sum(coalesce(mc.festival_amount, 0))::numeric as amount
    from public.monthly_costs mc
    left join public.festivals f on f.id = mc.festival_id
    left join public.cost_types ct on ct.id = mc.cost_type_id
    left join public.monthly_cost_channels mcc on mcc.monthly_cost_id = mc.id
    left join public.channels c on c.id = coalesce(mcc.channel_id, mc.primary_channel_id)
    where mc.festival_amount is not null
      and coalesce(mc.festival_range_start, mc.month_at) is not null
      and coalesce(ct.is_advertising, false)
    group by 1, 2, 3, 4, 5, 6
  ),
  non_peak_costs as (
    select
      'non_peak'::text as segment_type,
      extract(month from mc.month_at at time zone 'Asia/Hong_Kong')::integer::text as segment_key,
      concat(extract(month from mc.month_at at time zone 'Asia/Hong_Kong')::integer, '月 non-peak') as segment_label,
      extract(year from mc.month_at at time zone 'Asia/Hong_Kong')::integer as report_year,
      coalesce(nullif(btrim(c.name), ''), 'Unassigned') as channel_name,
      coalesce(nullif(btrim(ct.name), ''), 'Advertising') as metric_name,
      sum(coalesce(mc.non_peak_amount, 0))::numeric as amount
    from public.monthly_costs mc
    left join public.cost_types ct on ct.id = mc.cost_type_id
    left join public.monthly_cost_channels mcc on mcc.monthly_cost_id = mc.id
    left join public.channels c on c.id = coalesce(mcc.channel_id, mc.primary_channel_id)
    where mc.non_peak_amount is not null
      and mc.month_at is not null
      and coalesce(ct.is_advertising, false)
    group by 1, 2, 3, 4, 5, 6
  ),
  combined as (
    select * from festival_sales
    union all select * from non_peak_sales
    union all select * from festival_costs
    union all select * from non_peak_costs
  )
  select
    segment_type,
    segment_key,
    segment_label,
    report_year,
    channel_name,
    metric_name,
    sum(amount)::numeric as amount
  from combined
  group by 1, 2, 3, 4, 5, 6
  order by
    segment_type,
    segment_label,
    report_year,
    channel_name,
    case when lower(metric_name) = 'sales' then 0 else 1 end,
    metric_name;
$$;

revoke all on function public.report_kitchen_advertising_performance() from public, anon;
grant execute on function public.report_kitchen_advertising_performance() to authenticated;
