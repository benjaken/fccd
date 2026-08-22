-- Allow order managers to maintain the eight operational order statuses from
-- the All Orders action column. Other existing statuses are preserved.
create or replace function public.update_order_list_statuses(
  p_order_id uuid,
  p_status_legacy_ids text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_allowed_ids text[];
begin
  if not private.has_page_manage('orders') then
    raise exception 'not authorized to update order statuses'
      using errcode = '42501';
  end if;

  select coalesce(
    array_agg(status.legacy_id order by status.sort_order nulls last, status.name),
    '{}'::text[]
  )
  into v_allowed_ids
  from public.order_statuses status
  where status.archived_at is null
    and status.name in (
      '改期未定', 'WP', 'BW', 'FP', 'KLOOK', 'Alipay', '已拆單', '月結'
    );

  if exists (
    select 1
    from unnest(coalesce(p_status_legacy_ids, '{}'::text[])) requested(legacy_id)
    where not (requested.legacy_id = any(v_allowed_ids))
  ) then
    raise exception 'invalid order status selection'
      using errcode = '22023';
  end if;

  update public.orders orders
  set order_status_legacy_ids = array(
        select distinct selected.legacy_id
        from unnest(
          array(
            select existing.legacy_id
            from unnest(coalesce(orders.order_status_legacy_ids, '{}'::text[])) existing(legacy_id)
            where not (existing.legacy_id = any(v_allowed_ids))
          ) || coalesce(p_status_legacy_ids, '{}'::text[])
        ) selected(legacy_id)
      ),
      bubble_modified_at = now(),
      updated_at = now()
  where orders.id = p_order_id
    and orders.document_type = 'order'
    and orders.archived_at is null;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_order_list_statuses(uuid, text[]) from public, anon;
grant execute on function public.update_order_list_statuses(uuid, text[]) to authenticated;

comment on function public.update_order_list_statuses(uuid, text[]) is
  'Updates the eight selectable All Orders statuses while preserving unrelated statuses.';

-- Preserve selections made through the former manual-to-do control.
do $$
begin
  if to_regclass('public.order_list_manual_todos') is null then
    return;
  end if;

  execute $backfill$
with mapped as (
  select
    todo.order_id,
    status.legacy_id
  from public.order_list_manual_todos todo
  join public.order_statuses status
    on status.archived_at is null
   and status.name = case todo.todo_key
     when 'reschedule-pending' then '改期未定'
     when 'lwp' then 'WP'
     when 'lbw' then 'BW'
     when 'lfp' then 'FP'
     when 'klook' then 'KLOOK'
     when 'alipay' then 'Alipay'
     when 'monthly-settlement' then '月結'
   end
  where todo.todo_key <> 'cancelled'
), grouped as (
  select order_id, array_agg(distinct legacy_id) as legacy_ids
  from mapped
  group by order_id
)
update public.orders orders
set order_status_legacy_ids = array(
      select distinct legacy_id
      from unnest(
        coalesce(orders.order_status_legacy_ids, '{}'::text[]) || grouped.legacy_ids
      ) selected(legacy_id)
    ),
    updated_at = now()
from grouped
where orders.id = grouped.order_id
  $backfill$;
end;
$$;
