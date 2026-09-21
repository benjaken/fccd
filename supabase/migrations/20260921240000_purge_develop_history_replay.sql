-- 清除 develop 環境現有的歷史回放資料。
--
-- 只刪除 develop 的評估 run、其 samples（FK cascade）、修復提案及 R1 改寫規則；
-- production 及其他環境的資料不受影響。R2／R3 runtime 草稿欄位只隨提案一併刪除。
begin;
set local search_path = public, extensions, pg_temp;

-- 規則先刪，因其 proposal_id 外鍵指向修復提案（無 cascade）。
delete from public.customer_service_verified_rewrite_repairs
where environment = 'develop';

delete from public.customer_service_repair_proposals
where environment = 'develop';

-- samples 會經 run_id 外鍵 cascade 刪除。
delete from public.customer_service_history_eval_runs
where environment = 'develop';

commit;
