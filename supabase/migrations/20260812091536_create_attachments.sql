-- Normalized attachment registry. Source URLs are deliberately represented
-- only by a one-way digest; raw URLs remain in local, git-ignored manifests.
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  deterministic_key text not null unique,
  source_type text not null,
  source_legacy_row_id text,
  source_field text not null,
  owner_type text,
  owner_id uuid,
  owner_legacy_id text,
  original_filename text,
  source_url_hash text not null,
  bucket_id text not null default 'bubble-attachments-private',
  object_path text,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  source_modified_at timestamptz,
  migration_mode text not null
    check (migration_mode in ('baseline', 'incremental')),
  migration_status text not null default 'discovered'
    check (migration_status in (
      'discovered', 'enriched', 'uploaded', 'verified', 'failed'
    )),
  last_error_code text,
  uploaded_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deterministic_key ~ '^[0-9a-f]{64}$'),
  check (source_url_hash ~ '^[0-9a-f]{64}$'),
  check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  check (size_bytes is null or size_bytes >= 0),
  check (object_path is null or (
    object_path !~ '(^|/)\.\.?(/|$)'
    and object_path !~ '[?#]'
    and object_path !~ '^/'
  )),
  check (
    migration_status not in ('uploaded', 'verified')
    or object_path is not null
  ),
  check (
    migration_status <> 'verified'
    or (sha256 is not null and size_bytes is not null and verified_at is not null)
  )
);

create index attachments_owner_idx
  on public.attachments (owner_type, owner_id);
create index attachments_owner_legacy_idx
  on public.attachments (owner_type, owner_legacy_id);
create index attachments_source_row_idx
  on public.attachments (source_type, source_legacy_row_id);
create index attachments_incremental_idx
  on public.attachments (source_modified_at, deterministic_key);
create index attachments_status_idx
  on public.attachments (migration_status, migration_mode);
create index attachments_content_dedupe_idx
  on public.attachments (sha256, size_bytes)
  where sha256 is not null;
create unique index attachments_source_object_checksum_key
  on public.attachments (source_url_hash, object_path, sha256)
  where object_path is not null and sha256 is not null;

alter table public.attachments enable row level security;
revoke all on table public.attachments from anon, authenticated;
grant select, insert, update, delete on table public.attachments to service_role;

comment on table public.attachments is
  'Private Bubble attachment registry. Raw source URLs are prohibited; source_url_hash is SHA-256.';
comment on column public.attachments.deterministic_key is
  'SHA-256 of the canonical source type, row, field, and source URL digest.';
comment on column public.attachments.original_filename is
  'Potentially sensitive metadata; inaccessible to browser roles under default-deny RLS.';

-- This creates only private bucket configuration. No object or attachment data
-- is inserted by this migration.
insert into storage.buckets (id, name, public)
values ('bubble-attachments-private', 'bubble-attachments-private', false)
on conflict (id) do update set public = false;
