create or replace function public.get_kitchen_monthly_festival_costs(
  p_limit integer default 15,
  p_offset integer default 0
)
returns table (
  id uuid,
  month_at timestamptz,
  range_start timestamptz,
  range_end timestamptz,
  amount numeric,
  remarks text,
  cost_type_name text,
  festival_name text,
  channel_names jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with page_rows as (
    select
      mc.id,
      mc.month_at,
      mc.festival_range_start as range_start,
      mc.festival_range_end as range_end,
      mc.festival_amount as amount,
      mc.remarks,
      coalesce(btrim(ct.name), '—') as cost_type_name,
      coalesce(btrim(f.name), '—') as festival_name,
      mc.primary_channel_id,
      count(*) over () as total_count
    from public.monthly_costs mc
    left join public.cost_types ct on ct.id = mc.cost_type_id
    left join public.festivals f on f.id = mc.festival_id
    where mc.festival_amount is not null
    order by
      coalesce(mc.festival_range_start, mc.month_at) desc nulls last,
      mc.festival_range_end desc nulls last,
      coalesce(array_position(
        array[
          'shopify', 'electricity', 'rent', 'wages', 'facebook', 'google',
          'water', 'delivery charge', 'packing', 'miscellaneous', 'food cost',
          'marketing'
        ]::text[],
        lower(btrim(ct.name))
      ), 999),
      lower(btrim(ct.name)),
      mc.id
    limit greatest(1, least(coalesce(p_limit, 15), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    pr.id,
    pr.month_at,
    pr.range_start,
    pr.range_end,
    pr.amount,
    pr.remarks,
    pr.cost_type_name,
    pr.festival_name,
    coalesce(linked.names, case when primary_channel.name is null then '[]'::jsonb else jsonb_build_array(primary_channel.name) end),
    pr.total_count
  from page_rows pr
  left join public.channels primary_channel on primary_channel.id = pr.primary_channel_id
  left join lateral (
    select jsonb_agg(names.name order by names.sort_order, names.name) as names
    from (
      select distinct channel.name, channel.sort_order
      from public.monthly_cost_channels link
      join public.channels channel on channel.id = link.channel_id
      where link.monthly_cost_id = pr.id
    ) names
  ) linked on true
  order by
    coalesce(pr.range_start, pr.month_at) desc nulls last,
    pr.range_end desc nulls last,
    coalesce(array_position(
      array[
        'shopify', 'electricity', 'rent', 'wages', 'facebook', 'google',
        'water', 'delivery charge', 'packing', 'miscellaneous', 'food cost',
        'marketing'
      ]::text[],
      lower(pr.cost_type_name)
    ), 999),
    lower(pr.cost_type_name),
    pr.id;
$$;
