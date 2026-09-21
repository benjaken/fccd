-- FCCD R3 程式修改草稿（HR-08）：容許「產生最小 diff／PR 草稿」但永不自動發布。
--
-- 只在既有 customer_service_repair_proposals 上加欄位，不新增工作流平台。
-- 草稿永遠是待人工審查的 hypothesis，不寫入程式、不執行 SQL、不推 PR。
begin;
set local search_path = public, extensions, pg_temp;

alter table public.customer_service_repair_proposals
  add column if not exists code_change_draft jsonb not null default '{}'::jsonb
    check (jsonb_typeof(code_change_draft) = 'object'),
  add column if not exists drafted_at timestamptz,
  add column if not exists pr_url text;

-- 重建 status check，保留既有全部合法狀態，只加上 'drafted'。清單必須與
-- 20260919220000_customer_service_verified_rewrite_repairs.sql 的定義一致。
alter table public.customer_service_repair_proposals
  drop constraint if exists customer_service_repair_proposals_status_check;
alter table public.customer_service_repair_proposals
  add constraint customer_service_repair_proposals_status_check check (status in (
    'proposed', 'diagnosed', 'candidate', 'validating', 'eligible', 'ready', 'applying',
    'canary', 'active', 'applied', 'insufficient_evidence', 'unsupported_repair',
    'validation_failed', 'blocked', 'rejected', 'failed', 'rolled_back', 'drafted'
  ));

commit;
