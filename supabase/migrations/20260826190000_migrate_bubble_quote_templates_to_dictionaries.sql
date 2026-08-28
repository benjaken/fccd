-- Make every legacy Bubble quote term and payment template available in the
-- configurable dictionaries used by the quote and invoice PDF editors.
--
-- Reuse the stable values for the legacy rows represented by the five seeded
-- dictionary entries so the migration does not create duplicate options.
-- The other Bubble rows receive a stable value derived from their legacy id.
with legacy_rows as (
  select
    'term'::text as kind,
    legacy_id,
    btrim(content) as content,
    is_editable,
    bubble_created_at,
    bubble_modified_at
  from public.quote_terms_templates
  where length(btrim(content)) > 0

  union all

  select
    'payment'::text as kind,
    legacy_id,
    btrim(content) as content,
    is_editable,
    bubble_created_at,
    bubble_modified_at
  from public.quote_payment_templates
  where length(btrim(content)) > 0
),
numbered as (
  select
    legacy_rows.*,
    row_number() over (
      partition by kind
      order by bubble_created_at nulls last, legacy_id
    )::integer as ordinal
  from legacy_rows
),
mapped as (
  select
    types.id as dict_type_id,
    case
      when numbered.kind = 'term'
        and numbered.legacy_id = '1686214774089x288449176971509760'
        then 'utensils'
      when numbered.kind = 'term'
        and numbered.legacy_id = '1686214796800x871261839892676600'
        then 'validity'
      when numbered.kind = 'term'
        and numbered.legacy_id = '1686214802071x764297910237003800'
        then 'payment_confirmation'
      when numbered.kind = 'term'
        and numbered.legacy_id = '1718874871317x302550465051099140'
        then 'no_refund'
      when numbered.kind = 'term'
        and numbered.legacy_id = '1735319152080x494370356477034500'
        then 'delivery_slots'
      when numbered.kind = 'term'
        then 'bubble_term_' || numbered.legacy_id
      when numbered.kind = 'payment'
        and numbered.legacy_id = '1686214990243x103184228377427970'
        then 'bank_transfer'
      when numbered.kind = 'payment'
        and numbered.legacy_id = '1686215013377x619538784415907800'
        then 'cheque'
      when numbered.kind = 'payment'
        and numbered.legacy_id = '1686215024630x481193356469731300'
        then 'fps'
      when numbered.kind = 'payment'
        and numbered.legacy_id = '1686215039546x236202983578140670'
        then 'payme'
      when numbered.kind = 'payment'
        and numbered.legacy_id = '1686215046126x620179508545192000'
        then 'octopus'
      else 'bubble_payment_' || numbered.legacy_id
    end as value,
    numbered.content as label,
    numbered.is_editable,
    numbered.ordinal,
    numbered.kind,
    numbered.legacy_id,
    numbered.bubble_created_at,
    numbered.bubble_modified_at
  from numbered
  join public.dict_types types
    on types.code = case
      when numbered.kind = 'term' then 'quote_term_template'
      else 'quote_payment_template'
    end
)
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
  mapped.dict_type_id,
  mapped.value,
  mapped.label,
  null,
  '',
  jsonb_build_object(
    'source', 'bubble',
    'legacy_table',
      case
        when mapped.kind = 'term' then 'quote_terms_templates'
        else 'quote_payment_templates'
      end,
    'legacy_id', mapped.legacy_id,
    'is_editable', mapped.is_editable,
    'bubble_created_at', mapped.bubble_created_at,
    'bubble_modified_at', mapped.bubble_modified_at
  ),
  mapped.ordinal * 10,
  true
from mapped
on conflict (dict_type_id, value) do update
set
  label = excluded.label,
  label_en = excluded.label_en,
  description = excluded.description,
  metadata = excluded.metadata,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();
