-- FCCD 客服歷史匯入：保存 WATI sender metadata，令角色分類可審計及可重跑。
--
-- 背景：部分舊智能回覆被分類為 human，因為佢哋嘅 operator_name 同真人一樣。
-- 保存原始 sender 欄位後，可事後核對、重判，亦可據此擴充自動化語句過濾。
begin;
set local search_path = public, extensions, pg_temp;

alter table public.customer_service_learning_import_messages
  add column if not exists operator_name text,
  add column if not exists operator_email text,
  add column if not exists local_message_id text,
  add column if not exists event_type text;

comment on column public.customer_service_learning_import_messages.operator_name is
  'WATI sender operator_name (kept for auditing human vs automated classification).';
comment on column public.customer_service_learning_import_messages.event_type is
  'WATI event type (message / broadcastMessage / ticket / ...).';

commit;
