create table if not exists public.report_ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_role text not null default '',
  report_key text not null,
  permission_key text not null,
  locale text not null default 'zh-HK',
  snapshot_fingerprint text not null,
  prompt_version text not null,
  provider text not null,
  model text not null,
  input_summary_rows integer not null default 0,
  input_comparison_rows integer not null default 0,
  input_detail_rows integer not null default 0,
  status text not null check (status in ('running', 'complete', 'fallback', 'failed')),
  soft_limit_exceeded boolean not null default false,
  result jsonb,
  error_code text,
  feedback_rating text check (feedback_rating in ('helpful', 'unhelpful')),
  feedback_reason text check (feedback_reason in ('numbers', 'missing', 'unclear', 'other')),
  feedback_at timestamptz,
  duration_ms integer,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists report_ai_runs_cache_idx
  on public.report_ai_runs (user_id, report_key, locale, snapshot_fingerprint, prompt_version, created_at desc);

create index if not exists report_ai_runs_usage_idx
  on public.report_ai_runs (user_id, created_at desc);

alter table public.report_ai_runs enable row level security;

revoke all on public.report_ai_runs from anon, authenticated;

comment on table public.report_ai_runs is
  'Audit and short-lived result cache for permission-checked report AI interpretations; raw report snapshots are never stored.';
