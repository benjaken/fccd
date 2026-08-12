-- Durable control-plane schema for resumable migration workers.
-- This migration intentionally creates no worker, RPC, or browser policy.

create table public.migration_entities (
  id uuid primary key default gen_random_uuid(),
  source_type text not null unique,
  target_table text,
  domain text not null,
  phase text not null,
  mapping_status text not null default 'draft'
    check (mapping_status in ('draft', 'approved', 'implemented', 'retired')),
  historical_policy text not null default 'import_once'
    check (historical_policy = 'import_once'),
  enabled boolean not null default false,
  mapping_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.migration_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null
    check (job_type in ('full', 'incremental', 'resume', 'switch_source')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  resumed_from_job_id uuid references public.migration_jobs(id) on delete set null,
  snapshot_at timestamptz,
  historical_cutoff_at timestamptz not null
    default '2021-08-11 16:00:00+00'::timestamptz,
  checkpoint_upper_bound timestamptz,
  source_system text not null default 'bubble'
    check (source_system in ('bubble', 'supabase')),
  records_expected bigint not null default 0 check (records_expected >= 0),
  records_processed bigint not null default 0 check (records_processed >= 0),
  records_failed bigint not null default 0 check (records_failed >= 0),
  context jsonb not null default '{}'::jsonb,
  error_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (finished_at is null or started_at is not null),
  check (checkpoint_upper_bound is null or snapshot_at is null or checkpoint_upper_bound <= snapshot_at)
);

create table public.migration_entity_checkpoints (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.migration_entities(id) on delete cascade,
  dataset text not null check (dataset in ('historical', 'active')),
  last_successful_job_id uuid references public.migration_jobs(id) on delete set null,
  last_successful_modified_at timestamptz,
  historical_completed_at timestamptz,
  source_cursor text,
  records_processed bigint not null default 0 check (records_processed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, dataset),
  check (
    dataset <> 'historical'
    or last_successful_modified_at is null
  )
);

create table public.migration_entity_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.migration_jobs(id) on delete cascade,
  entity_id uuid not null references public.migration_entities(id) on delete restrict,
  checkpoint_id uuid references public.migration_entity_checkpoints(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'paused', 'succeeded', 'failed', 'skipped')),
  partition_key text not null default 'default',
  source_cursor text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  records_expected bigint not null default 0 check (records_expected >= 0),
  records_processed bigint not null default 0 check (records_processed >= 0),
  records_skipped bigint not null default 0 check (records_skipped >= 0),
  records_failed bigint not null default 0 check (records_failed >= 0),
  error_detail jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, entity_id, partition_key),
  check (finished_at is null or started_at is not null)
);

create table public.migration_fk_mappings (
  id uuid primary key default gen_random_uuid(),
  source_entity_id uuid not null references public.migration_entities(id) on delete cascade,
  source_field text not null,
  target_entity_id uuid not null references public.migration_entities(id) on delete restrict,
  target_legacy_field text not null default 'legacy_id',
  target_uuid_field text not null,
  cardinality text not null
    check (cardinality in ('one_to_many', 'many_to_one', 'one_to_one_candidate', 'many_to_many_candidate')),
  evidence text not null
    check (evidence in ('inferred', 'sample_verified', 'database_verified')),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'implemented', 'blocked', 'retired')),
  verified_reference_count bigint not null default 0 check (verified_reference_count >= 0),
  unresolved_reference_count bigint not null default 0 check (unresolved_reference_count >= 0),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_entity_id, source_field, target_entity_id)
);

create table public.migration_fk_issues (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid references public.migration_fk_mappings(id) on delete restrict,
  job_id uuid references public.migration_jobs(id) on delete set null,
  source_legacy_id text,
  target_legacy_id text,
  affected_record_count bigint not null default 1 check (affected_record_count > 0),
  issue_type text not null
    check (issue_type in ('orphan_reference', 'duplicate_target', 'invalid_reference', 'mapping_missing')),
  status text not null default 'open'
    check (status in ('open', 'accepted', 'resolved', 'ignored')),
  resolution_note text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'resolved' and resolved_at is not null)
    or status <> 'resolved'
  )
);

create table public.migration_data_source_setting (
  singleton boolean primary key default true check (singleton),
  active_source text not null default 'bubble'
    check (active_source in ('bubble', 'supabase')),
  switched_by_job_id uuid references public.migration_jobs(id) on delete restrict,
  switched_by uuid references auth.users(id) on delete set null,
  switched_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (switched_by_job_id is null and switched_at is null)
    or (switched_by_job_id is not null and switched_at is not null)
  )
);

create index migration_jobs_status_created_idx
  on public.migration_jobs (status, created_at desc);
create index migration_entity_tasks_job_status_idx
  on public.migration_entity_tasks (job_id, status);
create index migration_entity_tasks_entity_status_idx
  on public.migration_entity_tasks (entity_id, status);
create index migration_fk_mappings_target_idx
  on public.migration_fk_mappings (target_entity_id);
create index migration_fk_issues_open_idx
  on public.migration_fk_issues (status, mapping_id)
  where status = 'open';
create index migration_fk_issues_job_idx
  on public.migration_fk_issues (job_id)
  where job_id is not null;

alter table public.migration_entities enable row level security;
alter table public.migration_entities force row level security;
alter table public.migration_jobs enable row level security;
alter table public.migration_jobs force row level security;
alter table public.migration_entity_checkpoints enable row level security;
alter table public.migration_entity_checkpoints force row level security;
alter table public.migration_entity_tasks enable row level security;
alter table public.migration_entity_tasks force row level security;
alter table public.migration_fk_mappings enable row level security;
alter table public.migration_fk_mappings force row level security;
alter table public.migration_fk_issues enable row level security;
alter table public.migration_fk_issues force row level security;
alter table public.migration_data_source_setting enable row level security;
alter table public.migration_data_source_setting force row level security;

-- No RLS policies are created: PostgREST roles are default-denied. The
-- service_role retains its BYPASSRLS behavior and is the only granted API role.
revoke all on table
  public.migration_entities,
  public.migration_jobs,
  public.migration_entity_checkpoints,
  public.migration_entity_tasks,
  public.migration_fk_mappings,
  public.migration_fk_issues,
  public.migration_data_source_setting
from anon, authenticated;

grant select, insert, update, delete on table
  public.migration_entities,
  public.migration_jobs,
  public.migration_entity_checkpoints,
  public.migration_entity_tasks,
  public.migration_fk_mappings,
  public.migration_fk_issues,
  public.migration_data_source_setting
to service_role;

insert into public.migration_data_source_setting (singleton, active_source)
values (true, 'bubble');
