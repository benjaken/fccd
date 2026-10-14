-- Stop surfacing due reminders after their deadline has passed.
--
-- refresh_due_notifications only created quote_due / factory_unsent /
-- delivery_attention reminders while the deadline was in the future, but it
-- left the existing rows unresolved once that time passed. The result was that
-- notifications whose text already read "距離送餐日期還有 0 天" kept appearing
-- in the notification center weeks later. Resolve them here:
--   * quote_due / factory_unsent: Hong Kong delivery date is before today.
--   * delivery_attention: the delivery time has already passed.
-- delivered_unpaid is intentionally left alone because it tracks money that is
-- still owed rather than a deadline that passes.

create or replace function public.refresh_due_notifications(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_settings public.notification_settings%rowtype;
  v_today date := (p_now at time zone 'Asia/Hong_Kong')::date;
  v_count integer := 0;
  v_row record;
  v_days integer;
  v_hours numeric;
  v_priority text;
  v_stage integer;
begin
  select * into v_settings from public.notification_settings where singleton;

  for v_row in
    select id, created_by_user_id, order_number, customer_name_snapshot,
      (delivery_at at time zone 'Asia/Hong_Kong')::date as delivery_date
    from public.orders
    where document_type = 'quote' and archived_at is null
      and delivery_at is not null and created_by_user_id is not null
      and (quote_status is null or quote_status not in ('Done Deal', 'Case Closed'))
  loop
    v_days := v_row.delivery_date - v_today;
    if v_days between 0 and (select max(x) from unnest(v_settings.quote_delivery_days) x) then
      select min(x) into v_stage from unnest(v_settings.quote_delivery_days) x where x >= v_days;
      v_priority := case when v_days = 0 then 'urgent' when v_days <= 3 then 'important' else 'normal' end;
      perform private.upsert_business_notification(
        v_row.created_by_user_id, 'quote-due:' || v_row.id, 'quote_due', 'action', v_priority,
        '報價需要跟進',
        concat(coalesce(v_row.order_number, '未編號報價'), ' 距離送餐日期還有 ', v_days, ' 天。'),
        'quote', v_row.id, '/quotes/' || v_row.id,
        jsonb_build_object('daysRemaining', v_days, 'stage', v_stage, 'customer', v_row.customer_name_snapshot)
      );
      v_count := v_count + 1;
    end if;
  end loop;

  for v_row in
    select id, created_by_user_id, order_number,
      (delivery_at at time zone 'Asia/Hong_Kong')::date as delivery_date
    from public.orders
    where document_type = 'order' and archived_at is null
      and delivery_at is not null and created_by_user_id is not null
      and coalesce(is_sent_to_factory, false) = false
      and coalesce(do_not_send_to_factory, false) = false
  loop
    v_days := v_row.delivery_date - v_today;
    if v_days between 0 and (select max(x) from unnest(v_settings.factory_unsent_days) x) then
      select min(x) into v_stage from unnest(v_settings.factory_unsent_days) x where x >= v_days;
      v_priority := case when v_days <= 1 then 'urgent' when v_days <= 3 then 'important' else 'normal' end;
      perform private.upsert_business_notification(
        v_row.created_by_user_id, 'factory-unsent:' || v_row.id, 'factory_unsent', 'action', v_priority,
        '訂單尚未發送工場',
        concat(coalesce(v_row.order_number, '未編號訂單'), ' 距離送餐日期還有 ', v_days, ' 天。'),
        'order', v_row.id, '/orders/' || v_row.id,
        jsonb_build_object('daysRemaining', v_days, 'stage', v_stage)
      );
      v_count := v_count + 1;
    end if;
  end loop;

  for v_row in
    select orders.id, orders.created_by_user_id, orders.order_number, orders.outstanding,
      max(deliveries.fulfilled_at) as fulfilled_at
    from public.orders orders
    join public.deliveries deliveries on deliveries.order_id = orders.id
    where orders.document_type = 'order' and orders.archived_at is null
      and orders.created_by_user_id is not null and coalesce(orders.outstanding, 0) > 0
      and orders.delivery_status = '已送達' and deliveries.fulfilled_at is not null
    group by orders.id
  loop
    v_days := v_today - (v_row.fulfilled_at at time zone 'Asia/Hong_Kong')::date;
    if v_days >= (select min(x) from unnest(v_settings.delivered_unpaid_days) x) then
      select max(x) into v_stage from unnest(v_settings.delivered_unpaid_days) x where x <= v_days;
      v_priority := case when v_days >= 14 then 'urgent' when v_days >= 7 then 'important' else 'normal' end;
      perform private.upsert_business_notification(
        v_row.created_by_user_id, 'delivered-unpaid:' || v_row.id, 'delivered_unpaid', 'action', v_priority,
        '已送達訂單仍有欠款',
        concat(coalesce(v_row.order_number, '未編號訂單'), ' 尚欠 HK$', to_char(v_row.outstanding, 'FM999999990.00'), '。'),
        'order', v_row.id, '/orders/' || v_row.id,
        jsonb_build_object('daysOverdue', v_days, 'stage', v_stage, 'outstanding', v_row.outstanding)
      );
      v_count := v_count + 1;
    end if;
  end loop;

  for v_row in
    select deliveries.id, deliveries.order_id, deliveries.delivery_status,
      deliveries.delivery_at, orders.order_number
    from public.deliveries deliveries
    join public.orders orders on orders.id = deliveries.order_id
    where orders.document_type = 'order' and orders.archived_at is null
      and deliveries.delivery_at is not null
      and deliveries.fulfilled_at is null
      and coalesce(deliveries.delivery_status, '') not in ('已取消', '取消', 'Cancelled')
  loop
    v_hours := extract(epoch from (v_row.delivery_at - p_now)) / 3600;
    if v_hours between 0 and (select max(x) from unnest(v_settings.delivery_attention_hours) x) then
      select min(x) into v_stage from unnest(v_settings.delivery_attention_hours) x where x >= v_hours;
      v_priority := case when v_hours <= 1 then 'urgent' when v_hours <= 4 then 'important' else 'normal' end;
      perform private.notify_admins(
        'delivery-attention:' || v_row.id, 'delivery_attention', 'action', v_priority,
        '送貨狀態需要處理',
        concat(coalesce(v_row.order_number, '未編號訂單'), '：', coalesce(v_row.delivery_status, '未派車隊')),
        'delivery', v_row.id, '/delivery',
        jsonb_build_object('hoursRemaining', round(v_hours, 1), 'stage', v_stage, 'status', v_row.delivery_status)
      );
      v_count := v_count + 1;
    end if;
  end loop;

  update public.business_notifications notice
  set resolved_at = p_now, updated_at = p_now
  where notice.resolved_at is null and (
    (notice.event_type = 'quote_due' and (
      not exists (
        select 1 from public.orders o where o.id = notice.entity_id and o.document_type = 'quote'
          and o.archived_at is null and (o.quote_status is null or o.quote_status not in ('Done Deal', 'Case Closed'))
      )
      or exists (
        select 1 from public.orders o where o.id = notice.entity_id
          and o.delivery_at is not null
          and (o.delivery_at at time zone 'Asia/Hong_Kong')::date < v_today
      )
    ))
    or (notice.event_type = 'factory_unsent' and (
      not exists (
        select 1 from public.orders o where o.id = notice.entity_id and o.document_type = 'order'
          and o.archived_at is null and coalesce(o.is_sent_to_factory, false) = false
          and coalesce(o.do_not_send_to_factory, false) = false
      )
      or exists (
        select 1 from public.orders o where o.id = notice.entity_id
          and o.delivery_at is not null
          and (o.delivery_at at time zone 'Asia/Hong_Kong')::date < v_today
      )
    ))
    or (notice.event_type = 'delivered_unpaid' and not exists (
      select 1 from public.orders o where o.id = notice.entity_id and o.archived_at is null
        and o.delivery_status = '已送達' and coalesce(o.outstanding, 0) > 0
    ))
    or (notice.event_type = 'delivery_attention' and (
      not exists (
        select 1 from public.deliveries d where d.id = notice.entity_id
          and d.fulfilled_at is null
          and coalesce(d.delivery_status, '') not in ('已取消', '取消', 'Cancelled')
      )
      or exists (
        select 1 from public.deliveries d where d.id = notice.entity_id
          and d.delivery_at is not null and d.delivery_at < p_now
      )
    ))
  );

  return v_count;
end;
$$;

comment on function public.refresh_due_notifications(timestamptz) is
  'Refreshes quote/factory/delivery due reminders and clears them once their Hong Kong due date or delivery time has passed.';

-- Clear any reminders that are already past their deadline when this deploys.
select public.refresh_due_notifications();
