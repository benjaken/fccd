-- Counts unarchived orders by festival and Hong Kong generation month so the
-- report can compare festival order volume across years.

create or replace function public.report_festival_order_generation()
returns table (
  festival_key text,
  festival_label text,
  report_year integer,
  report_month integer,
  order_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(
      nullif(btrim(festival.name), ''),
      nullif(btrim(orders.festival_legacy_id), ''),
      '未分類節日'
    ) as festival_key,
    coalesce(
      nullif(btrim(festival.name), ''),
      nullif(btrim(orders.festival_legacy_id), ''),
      '未分類節日'
    ) as festival_label,
    extract(year from orders.effective_created_at at time zone 'Asia/Hong_Kong')::integer
      as report_year,
    extract(month from orders.effective_created_at at time zone 'Asia/Hong_Kong')::integer
      as report_month,
    count(*)::bigint as order_count
  from public.orders
  left join public.festivals as festival
    on festival.id = orders.festival_id
    or (
      orders.festival_id is null
      and festival.legacy_id = orders.festival_legacy_id
    )
  where orders.document_type = 'order'
    and orders.archived_at is null
    and orders.effective_created_at is not null
    and coalesce(
      nullif(btrim(festival.name), ''),
      nullif(btrim(orders.festival_legacy_id), ''),
      ''
    ) <> ''
  group by 1, 2, 3, 4
  order by 3, 4, 2;
$$;

revoke all on function public.report_festival_order_generation()
from public, anon;
grant execute on function public.report_festival_order_generation()
to authenticated, service_role;

comment on function public.report_festival_order_generation() is
  'Counts unarchived orders by festival and Hong Kong generation month. Runs as invoker so orders RLS applies.';
