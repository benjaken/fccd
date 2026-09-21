-- 移除 TypeSafe Jev 第二評判功能（已決定棄用）。
--
-- 刪除 20260921120000_customer_service_history_jev_judgments 建立嘅診斷表與
-- 原子 claim RPC；相關 Edge Function 邏輯與前端配置亦已移除。
begin;
set local search_path = public, extensions, pg_temp;

drop function if exists public.customer_service_history_jev_claim(uuid, text, text, text, integer, integer, integer);
drop table if exists public.customer_service_history_jev_judgments;

commit;
