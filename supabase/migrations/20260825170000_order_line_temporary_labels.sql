-- Allow quote/order lines without an existing product label to keep a label
-- draft that is available to the factory printing workflow.
alter table public.order_lines
  add column if not exists temporary_label_display_name text,
  add column if not exists temporary_label_quantity_label text;

comment on column public.order_lines.temporary_label_display_name is
  'Order-specific label line A, used only when the SKU has no linked product_labels row.';
comment on column public.order_lines.temporary_label_quantity_label is
  'Order-specific label line B, used only when the SKU has no linked product_labels row.';
