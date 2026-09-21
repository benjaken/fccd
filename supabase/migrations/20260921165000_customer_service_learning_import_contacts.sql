-- FCCD 客服歷史匯入：聯絡人快取與增量進度（additive）。
--
-- 目的：
--   1. 避免每次匯入都重新列舉全部 WATI 聯絡人（14k+，約 100s）。
--   2. 記住每個電話最後一次成功檢查嘅時間，重跑同一日期區間時可跳過。
--   3. 記住每個電話最後訊息時間，作為「近期活躍」過濾依據。
--
-- 只限 service role 存取；唔會影響任何線上客服資料。
begin;
set local search_path = public, extensions, pg_temp;

create table if not exists public.customer_service_learning_import_contacts (
  environment text not null check (length(btrim(environment)) > 0),
  phone text not null check (length(btrim(phone)) > 0),
  last_message_at timestamptz,
  last_checked_at timestamptz,
  message_count integer not null default 0 check (message_count >= 0),
  enumerated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (environment, phone)
);

create index if not exists customer_service_learning_import_contacts_enumerated_idx
  on public.customer_service_learning_import_contacts (environment, enumerated_at);
create index if not exists customer_service_learning_import_contacts_checked_idx
  on public.customer_service_learning_import_contacts (environment, last_checked_at);

alter table public.customer_service_learning_import_contacts enable row level security;
revoke all on table public.customer_service_learning_import_contacts from public, anon, authenticated;
grant all on table public.customer_service_learning_import_contacts to service_role;

commit;
