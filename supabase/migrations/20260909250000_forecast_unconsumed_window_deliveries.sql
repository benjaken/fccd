-- Consumption is dated at delivery time, so current stock no longer includes
-- future committed legs. The 14-day forecast must include those legs until
-- their consumed_at has actually passed.
create or replace function private.catering_pending_delivery_slices(p_start_date date, p_days integer)
returns table (source_line_id uuid, source_order_id uuid, product_id uuid, line_quantity numeric,
  delivery_id uuid, service_at timestamptz, source_quantity numeric)
language sql stable security definer set search_path = public, private, pg_temp as $$
  with bounds as (
    select
      p_start_date::timestamp at time zone 'Asia/Hong_Kong' as starts_at,
      (p_start_date + greatest(1, least(coalesce(p_days, 14), 31)))::timestamp
        at time zone 'Asia/Hong_Kong' as ends_at
  ), live_catering_lines as (
    select line.*, orders.order_number,
      coalesce(line.delivery_at, orders.delivery_at) as fallback_service_at
    from public.order_lines line
    join public.orders orders on orders.id = line.order_id
    where orders.document_type = 'order'
      and orders.archived_at is null
      and orders.merged_into_order_id is null
      and coalesce(orders.delivery_status, '') not in
        ('已取消', '取消', 'Cancelled', 'cancelled')
      and line.is_void is false
      and not exists (
        select 1 from public.order_list_manual_todos todo
        where todo.order_id = orders.id and todo.todo_key = 'cancelled'
      )
  ), catering_slices as (
    select line.id as source_line_id, line.order_id as source_order_id,
      line.product_id, line.quantity as line_quantity,
      allocation.delivery_id, delivery.delivery_at as service_at,
      allocation.allocated_quantity as source_quantity
    from live_catering_lines line
    join public.order_line_delivery_allocations allocation
      on allocation.order_line_id = line.id
    join public.deliveries delivery on delivery.id = allocation.delivery_id
    cross join bounds
    where coalesce(delivery.delivery_status, '') not in
        ('已取消', '取消', 'Cancelled', 'cancelled')
      and delivery.delivery_at >= bounds.starts_at
      and delivery.delivery_at < bounds.ends_at
      and not exists (
        select 1 from public.order_material_consumptions consumption
        where consumption.delivery_id = delivery.id
          and consumption.reversed_at is null
          and consumption.consumed_at <= now()
      )

    union all

    select line.id, line.order_id, line.product_id, line.quantity,
      null::uuid, line.fallback_service_at, line.quantity
    from live_catering_lines line
    cross join bounds
    where not exists (
        select 1 from public.order_line_delivery_allocations allocation
        where allocation.order_line_id = line.id
      )
      and not exists (
        select 1 from public.order_material_consumptions consumption
        where consumption.order_line_id = line.id
          and consumption.reversed_at is null
          and consumption.consumed_at <= now()
      )
      and line.fallback_service_at >= bounds.starts_at
      and line.fallback_service_at < bounds.ends_at

  ) select * from catering_slices;
$$;
revoke all on function private.catering_pending_delivery_slices(date, integer) from public, anon, authenticated;
