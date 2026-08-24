-- Factory order-change alerts belong exclusively to the factory board.
-- The board reads factory_change_tasks directly, so no global bell notification
-- should be created for these changes.

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
  v_priority text;
begin
  select id, order_number, delivery_at, factory_print_date
  into v_order from public.orders
  where id = p_order_id
    and document_type = 'order'
    and coalesce(is_sent_to_factory, false);
  if not found then return; end if;

  select urgent_factory_change_hours
  into v_hours
  from public.notification_settings
  where singleton;

  v_priority := case
    when v_order.factory_print_date is not null
      or (
        v_order.delivery_at is not null
        and v_order.delivery_at <= now() + make_interval(hours => v_hours)
      )
    then 'urgent'
    else 'important'
  end;

  insert into public.factory_change_tasks (
    order_id,
    priority,
    last_change_type,
    needs_label_reprint,
    needs_delivery_note_reprint
  ) values (
    p_order_id,
    v_priority,
    p_change_type,
    p_labels,
    p_delivery_note
  )
  on conflict (order_id) do update
  set priority = case
        when excluded.priority = 'urgent' then 'urgent'
        else public.factory_change_tasks.priority
      end,
      change_count = public.factory_change_tasks.change_count + 1,
      last_change_type = excluded.last_change_type,
      needs_label_reprint = public.factory_change_tasks.needs_label_reprint
        or excluded.needs_label_reprint,
      needs_delivery_note_reprint = public.factory_change_tasks.needs_delivery_note_reprint
        or excluded.needs_delivery_note_reprint,
      status = 'pending',
      acknowledged_at = null,
      acknowledged_by = null,
      last_changed_at = now();
end;
$$;

-- Hide outstanding legacy copies from the global notification center while
-- retaining their history in the audit trail.
update public.business_notifications
set resolved_at = coalesce(resolved_at, now()),
    updated_at = now()
where event_type = 'factory_order_changed'
  and resolved_at is null;
