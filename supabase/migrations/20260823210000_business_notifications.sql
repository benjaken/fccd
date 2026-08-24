-- Unified in-app notifications, reminder rules, and factory change tasks.

alter table public.orders
  add column if not exists created_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists quote_auto_closed_at timestamptz,
  add column if not exists quote_close_reason text,
  add column if not exists quote_reopen_reason text;

update public.orders orders
set created_by_user_id = profiles.id
from public.user_profiles profiles
where orders.created_by_user_id is null
  and orders.bubble_created_by_legacy_id is not null
  and profiles.legacy_id = orders.bubble_created_by_legacy_id;

alter table public.orders
  alter column created_by_user_id set default auth.uid();

create index if not exists orders_created_by_user_id_idx
  on public.orders (created_by_user_id);

create table if not exists public.notification_settings (
  singleton boolean primary key default true check (singleton),
  quote_delivery_days integer[] not null default array[7, 3, 0],
  factory_unsent_days integer[] not null default array[7, 3, 1],
  delivered_unpaid_days integer[] not null default array[1, 3, 7, 14],
  delivery_attention_hours integer[] not null default array[24, 4, 1],
  urgent_factory_change_hours integer not null default 24 check (urgent_factory_change_hours >= 0),
  normal_change_merge_minutes integer not null default 5 check (normal_change_merge_minutes >= 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.notification_settings (singleton)
values (true)
on conflict (singleton) do nothing;

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
) values (
  'settings.notifications', '通知與提醒', '/settings/notifications', 127, false, 'settings', 'subpage'
)
on conflict (page_key) do update set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

with roles(role) as (
  values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'),
    ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select role, 'settings.notifications', role in ('Super Admin', 'Admin'), role in ('Super Admin', 'Admin')
from roles
on conflict (role, page_key) do update set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();

create table if not exists public.business_notifications (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  category text not null default 'action' check (category in ('information', 'action')),
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  route text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  snoozed_until timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dedupe_key, recipient_user_id)
);

create index if not exists business_notifications_recipient_active_idx
  on public.business_notifications (recipient_user_id, updated_at desc)
  where resolved_at is null;

create table if not exists public.notification_audit_log (
  id bigint generated always as identity primary key,
  notification_id uuid references public.business_notifications (id) on delete set null,
  action text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.factory_change_tasks (
  order_id uuid primary key references public.orders (id) on delete cascade,
  priority text not null default 'important' check (priority in ('important', 'urgent')),
  change_count integer not null default 1,
  last_change_type text not null,
  needs_label_reprint boolean not null default false,
  needs_delivery_note_reprint boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'acknowledged')),
  first_changed_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null
);

alter table public.notification_settings enable row level security;
alter table public.business_notifications enable row level security;
alter table public.notification_audit_log enable row level security;
alter table public.factory_change_tasks enable row level security;

grant select, update on public.business_notifications to authenticated;
grant select, update on public.notification_settings to authenticated;
grant select on public.notification_audit_log to authenticated;
grant select on public.factory_change_tasks to authenticated;

drop policy if exists notification_settings_read on public.notification_settings;
create policy notification_settings_read on public.notification_settings
for select to authenticated using (true);

drop policy if exists notification_settings_manage on public.notification_settings;
create policy notification_settings_manage on public.notification_settings
for all to authenticated
using (private.jwt_app_role() in ('Super Admin', 'Admin'))
with check (private.jwt_app_role() in ('Super Admin', 'Admin'));

drop policy if exists business_notifications_read_own on public.business_notifications;
create policy business_notifications_read_own on public.business_notifications
for select to authenticated using (recipient_user_id = auth.uid());

drop policy if exists business_notifications_update_own on public.business_notifications;
create policy business_notifications_update_own on public.business_notifications
for update to authenticated using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

drop policy if exists notification_audit_read_admin on public.notification_audit_log;
create policy notification_audit_read_admin on public.notification_audit_log
for select to authenticated
using (private.jwt_app_role() in ('Super Admin', 'Admin'));

drop policy if exists factory_change_tasks_read on public.factory_change_tasks;
create policy factory_change_tasks_read on public.factory_change_tasks
for select to authenticated
using (private.jwt_app_role() in ('Super Admin', 'Admin', 'Factory'));

create or replace function private.upsert_business_notification(
  p_recipient_user_id uuid,
  p_dedupe_key text,
  p_event_type text,
  p_category text,
  p_priority text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_route text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_recipient_user_id is null then return null; end if;

  insert into public.business_notifications (
    recipient_user_id, dedupe_key, event_type, category, priority,
    title, body, entity_type, entity_id, route, metadata
  ) values (
    p_recipient_user_id, p_dedupe_key, p_event_type, p_category, p_priority,
    p_title, p_body, p_entity_type, p_entity_id, p_route, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (dedupe_key, recipient_user_id) do update
  set event_type = excluded.event_type,
      category = excluded.category,
      priority = excluded.priority,
      title = excluded.title,
      body = excluded.body,
      entity_type = excluded.entity_type,
      entity_id = excluded.entity_id,
      route = excluded.route,
      metadata = public.business_notifications.metadata || excluded.metadata,
      read_at = case
        when excluded.event_type in ('quote_due', 'factory_unsent', 'delivered_unpaid', 'delivery_attention')
          and public.business_notifications.metadata ->> 'stage'
            is not distinct from excluded.metadata ->> 'stage'
        then public.business_notifications.read_at
        else null
      end,
      snoozed_until = case
        when excluded.event_type in ('quote_due', 'factory_unsent', 'delivered_unpaid', 'delivery_attention')
          and public.business_notifications.metadata ->> 'stage'
            is not distinct from excluded.metadata ->> 'stage'
        then public.business_notifications.snoozed_until
        else null
      end,
      resolved_at = null,
      updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.notify_admins(
  p_dedupe_key text,
  p_event_type text,
  p_category text,
  p_priority text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_route text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_user record;
begin
  for v_user in
    select id from public.user_profiles where role in ('Super Admin', 'Admin')
  loop
    perform private.upsert_business_notification(
      v_user.id, p_dedupe_key, p_event_type, p_category, p_priority,
      p_title, p_body, p_entity_type, p_entity_id, p_route, p_metadata
    );
  end loop;
end;
$$;

create or replace function private.audit_business_notification()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif old.resolved_at is null and new.resolved_at is not null then
    v_action := 'resolved';
  elsif old.snoozed_until is distinct from new.snoozed_until then
    v_action := 'snoozed';
  elsif old.read_at is null and new.read_at is not null then
    v_action := 'read';
  else
    return new;
  end if;

  insert into public.notification_audit_log (notification_id, action, actor_user_id)
  values (new.id, v_action, auth.uid());
  return new;
end;
$$;

drop trigger if exists audit_business_notification on public.business_notifications;
create trigger audit_business_notification
after insert or update on public.business_notifications
for each row execute function private.audit_business_notification();

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
    (notice.event_type = 'quote_due' and not exists (
      select 1 from public.orders o where o.id = notice.entity_id and o.document_type = 'quote'
        and o.archived_at is null and (o.quote_status is null or o.quote_status not in ('Done Deal', 'Case Closed'))
    ))
    or (notice.event_type = 'factory_unsent' and not exists (
      select 1 from public.orders o where o.id = notice.entity_id and o.document_type = 'order'
        and o.archived_at is null and coalesce(o.is_sent_to_factory, false) = false
        and coalesce(o.do_not_send_to_factory, false) = false
    ))
    or (notice.event_type = 'delivered_unpaid' and not exists (
      select 1 from public.orders o where o.id = notice.entity_id and o.archived_at is null
        and o.delivery_status = '已送達' and coalesce(o.outstanding, 0) > 0
    ))
    or (notice.event_type = 'delivery_attention' and not exists (
      select 1 from public.deliveries d where d.id = notice.entity_id
        and d.fulfilled_at is null
        and coalesce(d.delivery_status, '') not in ('已取消', '取消', 'Cancelled')
    ))
  );

  return v_count;
end;
$$;

create or replace function private.notify_quote_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.document_type = 'quote'
    and new.quote_status is distinct from old.quote_status
    and new.created_by_user_id is not null
  then
    perform private.upsert_business_notification(
      new.created_by_user_id, 'quote-status:' || new.id, 'quote_status_changed', 'information', 'normal',
      '報價狀態已更新',
      concat(coalesce(new.order_number, '未編號報價'), '：', coalesce(new.quote_status, '未設定')),
      'quote', new.id, '/quotes/' || new.id,
      jsonb_build_object('status', new.quote_status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_quote_status_change on public.orders;
create trigger notify_quote_status_change
after update of quote_status on public.orders
for each row execute function private.notify_quote_status_change();

create or replace function private.notify_quote_owner_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.document_type = 'quote'
    and new.created_by_user_id is distinct from old.created_by_user_id
    and new.created_by_user_id is not null
  then
    update public.business_notifications
    set resolved_at = now(), updated_at = now()
    where entity_id = new.id and recipient_user_id = old.created_by_user_id
      and resolved_at is null;
    perform private.upsert_business_notification(
      new.created_by_user_id, 'quote-owner:' || new.id,
      'quote_transferred', 'action', 'important',
      '報價已轉交給你',
      coalesce(new.order_number, '未編號報價'),
      'quote', new.id, '/quotes/' || new.id, '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_quote_owner_change on public.orders;
create trigger notify_quote_owner_change
after update of created_by_user_id on public.orders
for each row execute function private.notify_quote_owner_change();

create or replace function private.notify_shopify_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if coalesce(new.is_shopify_order, false)
    and new.created_by_user_id is not null
    and coalesce(new.outstanding, 0) < coalesce(old.outstanding, new.grand_total, 0)
  then
    perform private.upsert_business_notification(
      new.created_by_user_id, 'shopify-payment:' || new.id,
      'shopify_payment_received', 'information', 'normal',
      'Shopify 付款狀態已更新',
      case when coalesce(new.outstanding, 0) <= 0
        then concat(coalesce(new.order_number, '未編號訂單'), ' 已全數付款。')
        else concat(coalesce(new.order_number, '未編號訂單'), ' 尚欠 HK$', to_char(new.outstanding, 'FM999999990.00'), '。')
      end,
      'order', new.id, '/orders/' || new.id,
      jsonb_build_object('outstanding', new.outstanding)
    );
    if coalesce(new.outstanding, 0) <= 0 then
      update public.business_notifications
      set resolved_at = now(), updated_at = now()
      where event_type = 'delivered_unpaid' and entity_id = new.id and resolved_at is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_shopify_payment_change on public.orders;
create trigger notify_shopify_payment_change
after update of outstanding on public.orders
for each row execute function private.notify_shopify_payment_change();

create or replace function private.notify_delivery_state_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_number text;
  v_priority text := 'normal';
begin
  if row(new.motorcade_id, new.accepted_at, new.taken_at, new.fulfilled_at, new.delivery_status)
     is not distinct from
     row(old.motorcade_id, old.accepted_at, old.taken_at, old.fulfilled_at, old.delivery_status)
  then return new; end if;

  select order_number into v_number from public.orders where id = new.order_id;
  if coalesce(new.delivery_status, '') in ('已取消', '取消', 'Cancelled')
     or coalesce(new.driver_confirmation_status, '') in ('rejected', 'timeout')
  then v_priority := 'urgent';
  elsif new.fulfilled_at is not null or new.taken_at is not null then
    v_priority := 'important';
  end if;

  perform private.notify_admins(
    'delivery-state:' || new.id, 'delivery_status_changed', 'information', v_priority,
    '送貨狀態已更新',
    concat(coalesce(v_number, '未編號訂單'), '：', coalesce(new.delivery_status, '待處理')),
    'delivery', new.id, '/delivery',
    jsonb_build_object('status', new.delivery_status)
  );
  return new;
end;
$$;

drop trigger if exists notify_delivery_state_change on public.deliveries;
create trigger notify_delivery_state_change
after update of motorcade_id, accepted_at, taken_at, fulfilled_at, delivery_status
on public.deliveries
for each row execute function private.notify_delivery_state_change();

create or replace function private.register_factory_change(
  p_order_id uuid,
  p_change_type text,
  p_labels boolean,
  p_delivery_note boolean
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order record;
  v_hours integer;
  v_merge_minutes integer;
  v_priority text;
  v_user record;
begin
  select id, order_number, delivery_at, factory_print_date, created_by_user_id
  into v_order from public.orders
  where id = p_order_id and document_type = 'order' and coalesce(is_sent_to_factory, false);
  if not found then return; end if;

  select urgent_factory_change_hours, normal_change_merge_minutes
  into v_hours, v_merge_minutes
  from public.notification_settings where singleton;
  v_priority := case
    when v_order.factory_print_date is not null
      or (v_order.delivery_at is not null and v_order.delivery_at <= now() + make_interval(hours => v_hours))
    then 'urgent' else 'important' end;

  insert into public.factory_change_tasks (
    order_id, priority, last_change_type, needs_label_reprint, needs_delivery_note_reprint
  ) values (
    p_order_id, v_priority, p_change_type, p_labels, p_delivery_note
  )
  on conflict (order_id) do update
  set priority = case when excluded.priority = 'urgent' then 'urgent' else public.factory_change_tasks.priority end,
      change_count = public.factory_change_tasks.change_count + 1,
      last_change_type = excluded.last_change_type,
      needs_label_reprint = public.factory_change_tasks.needs_label_reprint or excluded.needs_label_reprint,
      needs_delivery_note_reprint = public.factory_change_tasks.needs_delivery_note_reprint or excluded.needs_delivery_note_reprint,
      status = 'pending', acknowledged_at = null, acknowledged_by = null,
      last_changed_at = now();

  for v_user in select id from public.user_profiles where role in ('Super Admin', 'Admin', 'Factory')
  loop
    perform private.upsert_business_notification(
      v_user.id, 'factory-change:' || p_order_id, 'factory_order_changed', 'action', v_priority,
      '工場訂單資料已修改',
      concat(coalesce(v_order.order_number, '未編號訂單'), ' 需要檢查並重新打印受影響文件。'),
      'order', p_order_id, '/factory',
      jsonb_build_object('changeType', p_change_type, 'labels', p_labels, 'deliveryNote', p_delivery_note)
    );
  end loop;

  if v_priority = 'important' and v_merge_minutes > 0 then
    update public.business_notifications
    set snoozed_until = now() + make_interval(mins => v_merge_minutes), updated_at = now()
    where event_type = 'factory_order_changed' and entity_id = p_order_id
      and resolved_at is null;
  end if;
end;
$$;

create or replace function private.notify_factory_line_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and row(
    new.order_id, new.product_id, new.package_id, new.product_name_snapshot,
    new.content_snapshot, new.quantity, new.new_quantity_text,
    new.remarks_1, new.remarks_2, new.is_addon, new.is_void
  ) is not distinct from row(
    old.order_id, old.product_id, old.package_id, old.product_name_snapshot,
    old.content_snapshot, old.quantity, old.new_quantity_text,
    old.remarks_1, old.remarks_2, old.is_addon, old.is_void
  ) then
    return new;
  end if;
  perform private.register_factory_change(
    coalesce(new.order_id, old.order_id), 'order_line', true, false
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists notify_factory_line_change on public.order_lines;
create trigger notify_factory_line_change
after insert or update of product_id, package_id, product_name_snapshot, content_snapshot,
  quantity, new_quantity_text, remarks_1, remarks_2, is_addon, is_void or delete
on public.order_lines
for each row execute function private.notify_factory_line_change();

create or replace function private.notify_factory_order_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if coalesce(new.is_sent_to_factory, false) and row(
    new.delivery_at, new.delivery_time, new.ship_out_time,
    new.shipping_address_snapshot, new.contact_number_a_snapshot,
    new.customer_name_snapshot, new.factory_packing_note
  ) is distinct from row(
    old.delivery_at, old.delivery_time, old.ship_out_time,
    old.shipping_address_snapshot, old.contact_number_a_snapshot,
    old.customer_name_snapshot, old.factory_packing_note
  ) then
    perform private.register_factory_change(new.id, 'order_delivery_details',
      new.factory_packing_note is distinct from old.factory_packing_note, true);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_factory_order_change on public.orders;
create trigger notify_factory_order_change
after update of delivery_at, delivery_time, ship_out_time, shipping_address_snapshot,
  contact_number_a_snapshot, customer_name_snapshot, factory_packing_note
on public.orders
for each row execute function private.notify_factory_order_change();

create or replace function public.acknowledge_factory_change(
  p_order_id uuid,
  p_delivery_note_printed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_task public.factory_change_tasks%rowtype;
  v_order record;
begin
  if private.jwt_app_role() not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'factory_change_ack_forbidden' using errcode = '42501';
  end if;

  select * into v_task from public.factory_change_tasks where order_id = p_order_id for update;
  if not found then return; end if;
  select factory_reprint_required, created_by_user_id, order_number into v_order
  from public.orders where id = p_order_id;

  if v_task.needs_label_reprint and coalesce(v_order.factory_reprint_required, false) then
    raise exception 'factory_labels_still_require_reprint';
  end if;
  if v_task.needs_delivery_note_reprint and not p_delivery_note_printed then
    raise exception 'factory_delivery_note_still_requires_reprint';
  end if;

  update public.factory_change_tasks
  set status = 'acknowledged', acknowledged_at = now(), acknowledged_by = auth.uid()
  where order_id = p_order_id;

  update public.business_notifications
  set resolved_at = now(), updated_at = now()
  where event_type = 'factory_order_changed' and entity_id = p_order_id and resolved_at is null;

  perform private.upsert_business_notification(
    v_order.created_by_user_id, 'factory-change-ack:' || p_order_id,
    'factory_change_acknowledged', 'information', 'normal',
    '工場已確認訂單修改',
    concat(coalesce(v_order.order_number, '未編號訂單'), ' 的打印及現場資料已更新。'),
    'order', p_order_id, '/orders/' || p_order_id, '{}'::jsonb
  );
end;
$$;

grant execute on function public.refresh_due_notifications(timestamptz) to authenticated;
grant execute on function public.acknowledge_factory_change(uuid, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'business_notifications'
  ) then
    alter publication supabase_realtime add table public.business_notifications;
  end if;
end
$$;

select public.refresh_due_notifications();

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'fccd-refresh-due-notifications';
  if v_job is not null then perform cron.unschedule(v_job); end if;
end
$$;

select cron.schedule(
  'fccd-refresh-due-notifications',
  '0 * * * *',
  $$select public.refresh_due_notifications()$$
);

create or replace function public.close_expired_quote_follow_ups(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare closed_count integer;
begin
  update public.orders
  set quote_status = 'Case Closed',
      quote_auto_closed_at = p_now,
      quote_close_reason = 'delivery_date_passed',
      updated_at = p_now
  where document_type = 'quote' and archived_at is null and delivery_at is not null
    and (quote_status is null or quote_status not in ('Done Deal', 'Case Closed'))
    and (delivery_at at time zone 'Asia/Hong_Kong')::date
      < (p_now at time zone 'Asia/Hong_Kong')::date;
  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;
