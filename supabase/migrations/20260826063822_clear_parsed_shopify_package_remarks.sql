-- After Shopify package remarks are expanded into child product rows
-- (item_order 1.001, 1.002, ...), drop the duplicated menu text from the parent.

update public.order_lines as parent
set remarks_1 = null,
    updated_at = now()
from public.orders
where parent.order_id = orders.id
  and orders.source_system = 'shopify'
  and orders.archived_at is null
  and parent.remarks_1 is not null
  and btrim(parent.remarks_1) <> ''
  and exists (
    select 1
    from public.order_lines as child
    where child.order_id = parent.order_id
      and child.id <> parent.id
      and child.item_order > parent.item_order
      and child.item_order < parent.item_order + 1
  );
