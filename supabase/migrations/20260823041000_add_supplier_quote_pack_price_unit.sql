-- Add the PDF /pack price unit to the shared System Settings dictionary.

insert into public.dict_items (
  dict_type_id,
  value,
  label,
  label_en,
  description,
  metadata,
  sort_order,
  is_active
)
select
  types.id,
  'pack',
  '包',
  'pack',
  '供應商報價以每包計價。',
  '{"aliases":["pack","packs","pkg","package","包"]}'::jsonb,
  40,
  true
from public.dict_types types
where types.code = 'supplier_quote_price_unit'
on conflict (dict_type_id, value) do update
set
  label = excluded.label,
  label_en = excluded.label_en,
  description = excluded.description,
  metadata = excluded.metadata,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();
