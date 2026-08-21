-- The kitchen-notes queue is defined by a filled packing note, not an order tag.
-- Preserve descriptions that administrators have already customized.
update public.order_list_configs
set description = '「包裝備註」有填寫內容的訂單，工場需留意相關包裝指示。',
    updated_at = now()
where preset_key = 'kitchen-notes'
  and description = '已標示「廚房備註」的訂單，工場需留意特別烹調或包裝指示。';
