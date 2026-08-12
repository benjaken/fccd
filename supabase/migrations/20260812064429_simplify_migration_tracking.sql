drop table if exists public.migration_fk_issues cascade;
drop table if exists public.migration_fk_mappings cascade;
drop table if exists public.migration_entity_tasks cascade;
drop table if exists public.migration_entity_checkpoints cascade;
drop table if exists public.migration_data_source_setting cascade;
drop table if exists public.migration_jobs cascade;
drop table if exists public.migration_entities cascade;

create table public.migration (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null unique,
  mode text not null
    check (mode in ('historical', 'full', 'incremental', 'reconciliation')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  source_system text not null default 'bubble',
  target_system text not null default 'supabase',
  historical_cutoff_at timestamptz,
  snapshot_at timestamptz,
  checkpoint_at timestamptz,
  records_expected bigint not null default 0
    check (records_expected >= 0),
  records_processed bigint not null default 0
    check (records_processed >= 0),
  records_failed bigint not null default 0
    check (records_failed >= 0),
  error_count integer not null default 0
    check (error_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or started_at is not null)
);

create index migration_status_created_idx
  on public.migration (status, created_at desc);

alter table public.migration enable row level security;
alter table public.migration force row level security;

revoke all on public.migration from anon, authenticated;
grant select, insert, update, delete
  on public.migration
  to service_role;

comment on table public.migration is
  'Minimal server-side migration run history. All visual mapping and readiness data remains static in the frontend.';
