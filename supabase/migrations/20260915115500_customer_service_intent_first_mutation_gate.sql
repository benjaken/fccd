begin;

-- Availability is a first-class intent.  It is not a FAQ lookup and must not
-- be treated as permission to create a catering inquiry.
alter table public.customer_service_intents
  drop constraint if exists customer_service_intents_action_key_check;
alter table public.customer_service_intents
  add constraint customer_service_intents_action_key_check check (action_key in (
    'faq_search', 'availability_check', 'order_lookup', 'order_handoff',
    'inquiry_collect', 'human_handoff', 'refuse'
  ));

alter table public.customer_service_tool_permissions
  drop constraint if exists customer_service_tool_permissions_tool_key_check;
alter table public.customer_service_tool_permissions
  add constraint customer_service_tool_permissions_tool_key_check check (tool_key in (
    'search_faqs', 'check_order_intake', 'lookup_orders', 'write_inquiry',
    'notify_internal'
  ));

insert into public.customer_service_intents (
  intent_key, display_name, description, examples, action_key,
  enabled, priority, confidence_threshold
) values (
  'delivery_availability',
  '指定日期接單查詢',
  '客人詢問某個明確日期能否預訂、落單、送貨或安排到會。這是唯讀的接單查詢，不是要求建立到會查詢；必須理解完整句子的問句或查詢語氣。',
  array[
    '你好 請問九月26號預訂到會可以嗎',
    '26/9可以送貨嗎',
    '9月26號仲可唔可以落單',
    '請問下星期六有冇位做公司到會'
  ],
  'availability_check', true, 24, 0.55
)
on conflict (intent_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  examples = excluded.examples,
  action_key = excluded.action_key,
  enabled = excluded.enabled,
  priority = excluded.priority,
  confidence_threshold = excluded.confidence_threshold,
  updated_at = now();

insert into public.customer_service_tool_permissions (
  intent_key, tool_key, allowed, requires_human
) values (
  'delivery_availability', 'check_order_intake', true, false
)
on conflict (intent_key, tool_key) do update set
  allowed = excluded.allowed,
  requires_human = excluded.requires_human;

update public.customer_service_intents
set
  description = '客人明確希望建立或留下到會、活動、報價或餐飲需求，或正在補充一個已開始的到會流程。單獨提供日期／人數只代表資料，不代表授權寫入；詢問某日可否預訂應選指定日期接單查詢。',
  examples = array[
    '請幫我留下30人到會查詢',
    '想請客服跟進下星期公司活動報價',
    '我想建立50人午餐查詢'
  ],
  updated_at = now()
where intent_key = 'collect_inquiry';

update public.customer_service_reply_templates
set
  content = '收到。麻煩再提供活動日期或者人數其中一項；資料齊後我會先俾你確認，確認後先交俾客服跟進。',
  updated_at = now()
where template_key = 'collect_more';

commit;
