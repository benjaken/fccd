-- Move the Bubble add-on catalogue and blackout dates, which were imported
-- into the legacy-compatible lookup tables, into the customer self-service
-- settings tables. Both inserts are idempotent so this can safely be rerun.

with legacy_addon_products as (
  select
    source.channel_id,
    source.product_id,
    row_number() over (
      partition by source.channel_id
      order by source.bubble_created_at nulls last, source.legacy_id
    ) - 1 as sort_order
  from public.channel_products source
  where source.channel_id is not null
    and source.product_id is not null
)
insert into public.self_service_addon_products (
  channel_id,
  product_id,
  sort_order,
  is_active
)
select
  source.channel_id,
  source.product_id,
  source.sort_order,
  true
from legacy_addon_products source
where not exists (
  select 1
  from public.self_service_addon_products target
  where target.channel_id = source.channel_id
    and target.product_id = source.product_id
    and target.archived_at is null
);

insert into public.self_service_addon_block_dates (
  block_date,
  reason,
  created_at
)
select
  (source.blocked_at at time zone 'Asia/Hong_Kong')::date,
  'Migrated from legacy add-on block date',
  coalesce(source.bubble_created_at, source.created_at, now())
from public.order_block_dates source
where source.blocked_at is not null
on conflict (block_date) where archived_at is null do nothing;
