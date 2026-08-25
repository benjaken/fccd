-- Exact per-line audit trail for factory label reprints.
-- Existing factory_change_tasks remains the order-level work queue; this table
-- records the immutable detail needed to identify the affected label.

create table if not exists public.factory_order_line_changes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_line_id uuid not null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  line_name text,
  changed_fields jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists factory_order_line_changes_pending_order_idx
  on public.factory_order_line_changes(order_id, changed_at)
  where resolved_at is null;

create index if not exists factory_order_line_changes_pending_line_idx
  on public.factory_order_line_changes(order_line_id, changed_at)
  where resolved_at is null;

alter table public.factory_order_line_changes enable row level security;

grant select on public.factory_order_line_changes to authenticated;

drop policy if exists factory_order_line_changes_read
  on public.factory_order_line_changes;
create policy factory_order_line_changes_read
on public.factory_order_line_changes
for select
to authenticated
using (
  nullif((select auth.jwt()) -> 'app_metadata' ->> 'role', '')
    in ('Super Admin', 'Admin', 'Factory')
);

create or replace function private.audit_factory_order_line_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order_id uuid := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  v_line_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_changes jsonb := '{}'::jsonb;
  v_field text;
  v_line_name text;
begin
  if not exists (
    select 1
    from public.orders
    where id = v_order_id
      and document_type = 'order'
      and coalesce(is_sent_to_factory, false)
      and factory_print_date is not null
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  foreach v_field in array array[
    'product_id',
    'package_id',
    'product_name_snapshot',
    'content_snapshot',
    'quantity',
    'new_quantity_text',
    'remarks_1',
    'remarks_2',
    'is_addon',
    'is_void'
  ]
  loop
    if (v_old -> v_field) is distinct from (v_new -> v_field) then
      v_changes := v_changes || jsonb_build_object(
        v_field,
        jsonb_build_object(
          'before', v_old -> v_field,
          'after', v_new -> v_field
        )
      );
    end if;
  end loop;

  if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then
    return new;
  end if;

  v_line_name := coalesce(
    nullif(btrim(case when tg_op = 'DELETE' then old.content_snapshot else new.content_snapshot end), ''),
    nullif(btrim(case when tg_op = 'DELETE' then old.product_name_snapshot else new.product_name_snapshot end), ''),
    nullif(btrim(case when tg_op = 'INSERT' then new.sku_snapshot else old.sku_snapshot end), '')
  );

  insert into public.factory_order_line_changes (
    order_id,
    order_line_id,
    operation,
    line_name,
    changed_fields,
    changed_by
  ) values (
    v_order_id,
    v_line_id,
    lower(tg_op),
    v_line_name,
    v_changes,
    auth.uid()
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_factory_order_line_change on public.order_lines;
create trigger audit_factory_order_line_change
after insert or update of product_id, package_id, product_name_snapshot,
  content_snapshot, quantity, new_quantity_text, remarks_1, remarks_2,
  is_addon, is_void or delete
on public.order_lines
for each row execute function private.audit_factory_order_line_change();

create or replace function public.mark_factory_order_line_printed(
  p_order_line_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order_id uuid;
begin
  if private.jwt_app_role() not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'factory_label_print_forbidden' using errcode = '42501';
  end if;

  select order_id into v_order_id
  from public.order_lines
  where id = p_order_line_id and not is_void;

  if v_order_id is null then
    raise exception 'factory_order_line_not_found' using errcode = 'P0002';
  end if;

  update public.order_lines
  set is_printed = true
  where id = p_order_line_id;

  update public.factory_order_line_changes
  set resolved_at = now(), resolved_by = auth.uid()
  where order_line_id = p_order_line_id
    and resolved_at is null;

  if not exists (
    select 1 from public.order_lines
    where order_id = v_order_id and not is_void and not is_printed
  ) and not exists (
    select 1 from public.factory_order_line_changes
    where order_id = v_order_id and resolved_at is null
  ) then
    update public.orders
    set factory_print_date = now(),
        factory_reprint_required = false,
        updated_at = now()
    where id = v_order_id;

  end if;
end;
$$;

revoke all on function public.mark_factory_order_line_printed(uuid) from public;
grant execute on function public.mark_factory_order_line_printed(uuid)
  to authenticated;

-- Deleting a dish has no replacement label to print. The factory sees the
-- deletion in the change list and resolves it when confirming the updated job.
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
  v_had_audit boolean;
begin
  if private.jwt_app_role() not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'factory_change_ack_forbidden' using errcode = '42501';
  end if;

  select * into v_task from public.factory_change_tasks
  where order_id = p_order_id for update;
  if not found then return; end if;

  select exists (
    select 1 from public.factory_order_line_changes where order_id = p_order_id
  ) into v_had_audit;

  update public.factory_order_line_changes
  set resolved_at = now(), resolved_by = auth.uid()
  where order_id = p_order_id and operation = 'delete' and resolved_at is null;

  if v_had_audit and not exists (
    select 1 from public.factory_order_line_changes
    where order_id = p_order_id and resolved_at is null
  ) then
    update public.orders set factory_reprint_required = false, updated_at = now()
    where id = p_order_id;
  end if;

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
  where event_type = 'factory_order_changed' and entity_id = p_order_id
    and resolved_at is null;

  perform private.upsert_business_notification(
    v_order.created_by_user_id, 'factory-change-ack:' || p_order_id,
    'factory_change_acknowledged', 'information', 'normal',
    '工場已確認訂單修改',
    concat(coalesce(v_order.order_number, '未編號訂單'), ' 的打印及現場資料已更新。'),
    'order', p_order_id, '/orders/' || p_order_id, '{}'::jsonb
  );
end;
$$;

revoke all on function public.acknowledge_factory_change(uuid, boolean) from public;
grant execute on function public.acknowledge_factory_change(uuid, boolean)
  to authenticated;

comment on table public.factory_order_line_changes is
  'Immutable field-level audit events for order-line changes made after factory label printing.';
