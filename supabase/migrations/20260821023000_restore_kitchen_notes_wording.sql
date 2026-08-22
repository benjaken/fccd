-- The queue remains named Kitchen Notes even though its content is sourced
-- from the factory packing-note field.
update public.order_list_configs
set description = '有填寫「廚房備註」的訂單，工場需留意相關指示。',
    updated_at = now()
where preset_key = 'kitchen-notes'
  and description = '「包裝備註」有填寫內容的訂單，工場需留意相關包裝指示。';
