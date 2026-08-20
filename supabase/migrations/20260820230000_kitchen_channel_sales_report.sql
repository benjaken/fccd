-- Central-kitchen channel-sales report.
-- Sales are grouped by order delivery date and the channel assigned to the order.

create or replace function public.report_kitchen_channel_sales()
returns table (
  report_year integer,
  month_number integer,
  channel_name text,
  amount numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    extract(year from o.delivery_at at time zone 'Asia/Hong_Kong')::integer as report_year,
    extract(month from o.delivery_at at time zone 'Asia/Hong_Kong')::integer as month_number,
    coalesce(nullif(btrim(c.name), ''), 'Unassigned') as channel_name,
    sum(coalesce(o.grand_total, 0))::numeric as amount
  from public.orders o
  left join public.channels c
    on c.id = o.channel_id
    or (o.channel_id is null and c.legacy_id = o.channel_legacy_id)
  where o.document_type = 'order'
    and o.archived_at is null
    and o.delivery_at is not null
  group by 1, 2, 3
  order by 1 desc, 2 asc, 3 asc;
$$;

revoke all on function public.report_kitchen_channel_sales() from public, anon;
grant execute on function public.report_kitchen_channel_sales() to authenticated;
