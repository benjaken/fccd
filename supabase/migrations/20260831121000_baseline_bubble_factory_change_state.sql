-- Treat the currently imported Bubble factory state as the historical
-- baseline. Future order-line edits continue to set factory_reprint_required
-- and create fresh factory change tasks through the existing triggers.

update public.orders
set factory_reprint_required = false
where document_type = 'order'
  and legacy_id is not null
  and factory_reprint_required;

update public.factory_order_line_changes as line_change
set resolved_at = now(),
    resolved_by = null
from public.orders as factory_order
where factory_order.id = line_change.order_id
  and factory_order.document_type = 'order'
  and factory_order.legacy_id is not null
  and line_change.resolved_at is null;

update public.factory_change_tasks as change_task
set status = 'acknowledged',
    change_count = 0,
    needs_label_reprint = false,
    needs_delivery_note_reprint = false,
    acknowledged_at = now(),
    acknowledged_by = null
from public.orders as factory_order
where factory_order.id = change_task.order_id
  and factory_order.document_type = 'order'
  and factory_order.legacy_id is not null
  and change_task.status = 'pending';
