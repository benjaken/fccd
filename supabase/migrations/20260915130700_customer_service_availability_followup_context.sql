begin;

-- A time-only reply after a dated availability check is continuation context,
-- not a new FAQ query and not permission to create an inquiry.
update public.customer_service_intents
set
  description = '客人詢問某個明確日期能否預訂、落單、送貨或安排到會。這是唯讀的接單查詢，不是要求建立到會查詢。若 currentTask 以 availability: 開頭，單獨提供送達或活動時間代表延續目前查詢，不可改成 FAQ 搜尋或到會寫入。',
  examples = array(
    select distinct example
    from unnest(
      examples || array[
        '19點差不多（正在回答希望送達時間）',
        '晚上8點開始（正在回答活動開始時間）',
        '大約六點半送到（正在延續指定日期接單查詢）'
      ]::text[]
    ) example
    where btrim(example) <> ''
    order by example
  ),
  updated_at = now()
where intent_key = 'delivery_availability';

comment on column public.customer_service_conversations.pending_request is
  'Typed continuation marker for order lookup, handoff, confirmation, or read-only availability follow-up. An availability marker never authorizes inquiry writes.';

commit;
