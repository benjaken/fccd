create table public.bubble_incremental_checkpoints (
  source_type text primary key,
  checkpoint_at timestamptz not null,
  last_successful_run_id uuid
    references public.migration (id)
    on delete set null,
  records_inserted bigint not null default 0
    check (records_inserted >= 0),
  conflicts_logged bigint not null default 0
    check (conflicts_logged >= 0),
  updated_at timestamptz not null default now(),
  check (
    length(source_type) between 1 and 120
    and source_type !~ '[[:cntrl:]]'
  )
);

create table public.bubble_incremental_conflicts (
  id bigint generated always as identity primary key,
  run_id uuid not null
    references public.migration (id)
    on delete cascade,
  source_type text not null,
  source_legacy_id text not null,
  bubble_modified_at timestamptz,
  reason text not null default 'existing_legacy_id_preserved',
  payload_sha256 text not null,
  created_at timestamptz not null default now(),
  unique (run_id, source_type, source_legacy_id),
  check (
    length(source_type) between 1 and 120
    and source_type !~ '[[:cntrl:]]'
  ),
  check (length(source_legacy_id) between 1 and 160),
  check (payload_sha256 ~ '^[0-9a-f]{64}$')
);

create table public.bubble_incremental_cron_auth (
  singleton boolean primary key default true
    check (singleton),
  secret_sha256 text not null
    check (secret_sha256 ~ '^[0-9a-f]{64}$'),
  rotated_at timestamptz not null default now()
);

create index bubble_incremental_conflicts_source_idx
  on public.bubble_incremental_conflicts (
    source_type,
    bubble_modified_at desc
  );

alter table public.bubble_incremental_checkpoints enable row level security;
alter table public.bubble_incremental_checkpoints force row level security;
alter table public.bubble_incremental_conflicts enable row level security;
alter table public.bubble_incremental_conflicts force row level security;
alter table public.bubble_incremental_cron_auth enable row level security;
alter table public.bubble_incremental_cron_auth force row level security;

revoke all on public.bubble_incremental_checkpoints from anon, authenticated;
revoke all on public.bubble_incremental_conflicts from anon, authenticated;
revoke all on public.bubble_incremental_cron_auth from anon, authenticated;

grant select, insert, update, delete
  on public.bubble_incremental_checkpoints
  to service_role;
grant select, insert, update, delete
  on public.bubble_incremental_conflicts
  to service_role;
grant select
  on public.bubble_incremental_cron_auth
  to service_role;
grant usage, select
  on sequence public.bubble_incremental_conflicts_id_seq
  to service_role;

comment on table public.bubble_incremental_checkpoints is
  'Per-Bubble-type successful checkpoints for append-only daily synchronization.';
comment on table public.bubble_incremental_conflicts is
  'Existing legacy IDs observed after a checkpoint. Supabase rows are preserved and never overwritten.';
comment on table public.bubble_incremental_cron_auth is
  'SHA-256 only. The matching raw Cron credential is stored in Supabase Vault.';

-- Generate the Cron credential entirely inside Postgres so it never appears in
-- source control, migration logs, agent output, or Edge Function configuration.
do $$
declare
  cron_secret text;
begin
  select decrypted_secret
    into cron_secret
  from vault.decrypted_secrets
  where name = 'bubble_daily_cron_secret'
  order by created_at desc
  limit 1;

  if cron_secret is null then
    cron_secret := encode(gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      cron_secret,
      'bubble_daily_cron_secret',
      'FCCD daily Bubble incremental scheduler credential'
    );
  end if;

  insert into public.bubble_incremental_cron_auth (
    singleton,
    secret_sha256
  )
  values (
    true,
    encode(digest(cron_secret, 'sha256'), 'hex')
  )
  on conflict (singleton) do update
    set secret_sha256 = excluded.secret_sha256,
        rotated_at = now();
end
$$;
