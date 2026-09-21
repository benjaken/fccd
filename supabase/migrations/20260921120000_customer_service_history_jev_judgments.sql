-- FCCD 客服歷史回放：TypeSafe Jev 第二評判（additive）。
--
-- 獨立、按需、只供診斷。此表不覆寫 customer_service_history_eval_samples.judgment
-- 或 judge_model，也不授權任何自動修復、FAQ、訂單或 WhatsApp 發送。只限授權
-- Edge Function 以 service role 操作；anon／一般 authenticated 無直接讀寫。
--
-- 唯一鍵 (sample_id, rubric_version, model_requested) 防止同一樣本在同版本／同
-- 模型下被重複評分；lease_until 配合 customer_service_history_jev_claim RPC 作
-- 原子 claim，避免兩個工作程序同時呼叫 TypeSafe。
begin;
set local search_path = public, extensions, pg_temp;

create table if not exists public.customer_service_history_jev_judgments (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.customer_service_history_eval_samples(id) on delete cascade,
  run_id uuid not null references public.customer_service_history_eval_runs(id) on delete cascade,
  environment text not null check (length(btrim(environment)) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'complete', 'skipped', 'failed')),
  model_requested text not null check (length(btrim(model_requested)) > 0),
  model_resolved text,
  rubric_version text not null check (length(btrim(rubric_version)) > 0),
  input_fingerprint text,
  answers jsonb check (answers is null or jsonb_typeof(answers) = 'object'),
  agreement text check (agreement is null or agreement in ('agree', 'divergent', 'incomparable')),
  error_code text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  elapsed_ms integer check (elapsed_ms is null or elapsed_ms >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  outcome_uncertain boolean not null default false,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sample_id, rubric_version, model_requested)
);
create index if not exists customer_service_history_jev_judgments_run_idx
  on public.customer_service_history_jev_judgments (run_id, status);
create index if not exists customer_service_history_jev_judgments_sample_idx
  on public.customer_service_history_jev_judgments (sample_id);

alter table public.customer_service_history_jev_judgments enable row level security;
revoke all on table public.customer_service_history_jev_judgments from public, anon, authenticated;
grant all on table public.customer_service_history_jev_judgments to service_role;

-- 原子 claim：
--   1. 為 run 內所有可評估（status = 'scored'）樣本補上 pending 列，冪等；
--   2. 以 FOR UPDATE SKIP LOCKED 領取 pending、租約過期，或可重試的 failed 列，
--      設定 processing 與新租約，回傳已領取的完整列。
create or replace function public.customer_service_history_jev_claim(
  p_run_id uuid,
  p_environment text,
  p_model text,
  p_rubric_version text,
  p_limit integer,
  p_lease_seconds integer,
  p_max_attempts integer
) returns setof public.customer_service_history_jev_judgments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.customer_service_history_jev_judgments
    (sample_id, run_id, environment, status, model_requested, rubric_version, attempt_count, updated_at)
  select s.id, s.run_id, p_environment, 'pending', p_model, p_rubric_version, 0, now()
    from public.customer_service_history_eval_samples s
   where s.run_id = p_run_id
     and s.status = 'scored'
  on conflict (sample_id, rubric_version, model_requested) do nothing;

  return query
  update public.customer_service_history_jev_judgments j
     set status = 'processing',
         attempt_count = j.attempt_count + 1,
         outcome_uncertain = false,
         lease_until = now() + make_interval(secs => greatest(1, p_lease_seconds)),
         updated_at = now()
   where j.id in (
     select c.id
       from public.customer_service_history_jev_judgments c
      where c.run_id = p_run_id
        and c.environment = p_environment
        and c.model_requested = p_model
        and c.rubric_version = p_rubric_version
        and (
          c.status = 'pending'
          or (c.status = 'processing' and c.lease_until is not null and c.lease_until < now())
          or (c.status = 'failed' and c.attempt_count < greatest(1, p_max_attempts)
              and coalesce(c.error_code, '') in (
                'timeout', 'rate_limited', 'overloaded', 'provider_unavailable', 'outcome_uncertain'
              ))
        )
      order by c.created_at
      limit greatest(1, p_limit)
      for update skip locked
   )
   returning j.*;
end;
$$;

revoke all on function public.customer_service_history_jev_claim(uuid, text, text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.customer_service_history_jev_claim(uuid, text, text, text, integer, integer, integer)
  to service_role;

commit;
