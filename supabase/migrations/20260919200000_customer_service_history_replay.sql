-- FCCD 歷史對話回放與低風險修復（HR-03）：三個 additive 邏輯實體。
--
-- 只供內部授權評估；匿名／一般客戶不可讀寫。評分結果、提案與來源連結全部
-- 限權，UI 只顯示脫敏投影，原始對話回查需另行授權。不建立通用工作流平台。
begin;
set local search_path = public, extensions, pg_temp;

create table if not exists public.customer_service_history_eval_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (length(btrim(environment)) > 0),
  scope text not null default 'answer_quality'
    check (scope in ('answer_quality', 'routing_safety')),
  evaluation_mode text not null default 'current_policy_regression'
    check (evaluation_mode in ('current_policy_regression')),
  baseline_ref text,
  candidate_ref text,
  dataset_hash text,
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  flags jsonb not null default '{}'::jsonb check (jsonb_typeof(flags) = 'object'),
  budget jsonb not null default '{}'::jsonb check (jsonb_typeof(budget) = 'object'),
  sample_size integer not null default 0 check (sample_size >= 0),
  planned integer not null default 0 check (planned >= 0),
  processed integer not null default 0 check (processed >= 0),
  skipped integer not null default 0 check (skipped >= 0),
  failed integer not null default 0 check (failed >= 0),
  scored integer not null default 0 check (scored >= 0),
  cursor text,
  complete_sample_set boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'partial', 'complete', 'failed', 'cancelled')),
  error text,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists customer_service_history_eval_runs_env_idx
  on public.customer_service_history_eval_runs (environment, created_at desc);

create table if not exists public.customer_service_history_eval_samples (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.customer_service_history_eval_runs(id) on delete cascade,
  source_fingerprint text not null,
  trial_index integer not null default 0 check (trial_index >= 0),
  question text not null,
  context jsonb not null default '[]'::jsonb check (jsonb_typeof(context) = 'array'),
  reference_answer text,
  scenario_at timestamptz,
  context_cutoff_at timestamptz,
  evaluation_at timestamptz,
  policy_as_of timestamptz,
  clock_mode text not null default 'scenario'
    check (clock_mode in ('scenario', 'evaluation', 'unknown')),
  pairing text not null default 'confident'
    check (pairing in ('confident', 'pairing_uncertain')),
  context_gap boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'scored', 'not_evaluable', 'out_of_scope', 'execution_failed', 'skipped')),
  authoritative_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(authoritative_evidence) = 'array'),
  ai_answer text,
  trace jsonb not null default '{}'::jsonb check (jsonb_typeof(trace) = 'object'),
  judge_model text,
  judge_rubric_version text,
  judgment jsonb,
  human_review jsonb,
  lineage jsonb not null default '{}'::jsonb check (jsonb_typeof(lineage) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, source_fingerprint, trial_index)
);
create index if not exists customer_service_history_eval_samples_run_idx
  on public.customer_service_history_eval_samples (run_id, status);

create table if not exists public.customer_service_repair_proposals (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (length(btrim(environment)) > 0),
  repair_kind text not null check (repair_kind in (
    'reembed_index', 'alias_candidate', 'template_candidate', 'case_guidance_candidate', 'code_change_proposal'
  )),
  risk_level text not null default 'R0' check (risk_level in ('R0', 'R1', 'R2', 'R3')),
  target_type text,
  target_id uuid,
  scope jsonb not null default '{}'::jsonb check (jsonb_typeof(scope) = 'object'),
  base_revision bigint,
  base_hash text,
  base_profile text,
  allowlist_version text,
  source_sample_ids uuid[] not null default '{}',
  reason text,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  candidate_patch jsonb not null default '{}'::jsonb check (jsonb_typeof(candidate_patch) = 'object'),
  validation jsonb not null default '{}'::jsonb check (jsonb_typeof(validation) = 'object'),
  status text not null default 'proposed' check (status in (
    'proposed', 'validating', 'ready', 'applying', 'applied', 'blocked', 'rejected', 'failed', 'rolled_back'
  )),
  idempotency_key text not null unique,
  preauthorized boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  executed_by text,
  executed_at timestamptz,
  rollback jsonb,
  rollback_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_service_repair_proposals_env_idx
  on public.customer_service_repair_proposals (environment, status, created_at desc);

alter table public.customer_service_history_eval_runs enable row level security;
alter table public.customer_service_history_eval_samples enable row level security;
alter table public.customer_service_repair_proposals enable row level security;
revoke all on table public.customer_service_history_eval_runs from public, anon, authenticated;
revoke all on table public.customer_service_history_eval_samples from public, anon, authenticated;
revoke all on table public.customer_service_repair_proposals from public, anon, authenticated;
grant all on table public.customer_service_history_eval_runs to service_role;
grant all on table public.customer_service_history_eval_samples to service_role;
grant all on table public.customer_service_repair_proposals to service_role;

commit;
