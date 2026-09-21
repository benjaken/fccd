-- Historical WATI conversation import for offline customer-service learning.
--
-- Imported rows deliberately live in their own table so a backfill of past
-- WhatsApp conversations can never become live bot context. The live bot only
-- reads public.customer_service_messages (30-day lookback); the daily learning
-- report reads both tables and deduplicates by (source_message_id, role).

create table if not exists public.customer_service_learning_import_messages (
  id uuid primary key default gen_random_uuid(),
  source_message_id text not null,
  phone_normalized text not null,
  role text not null check (role in ('customer', 'assistant', 'human')),
  message_text text not null default '',
  intent_key text,
  dialog_action text,
  environment text not null default 'production',
  created_at timestamptz not null,
  imported_at timestamptz not null default now(),
  unique (environment, source_message_id, role)
);
create index if not exists customer_service_learning_import_messages_context_idx
  on public.customer_service_learning_import_messages (environment, phone_normalized, created_at);
create index if not exists customer_service_learning_import_messages_period_idx
  on public.customer_service_learning_import_messages (environment, created_at);

create table if not exists public.customer_service_learning_import_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production',
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'failed')),
  since timestamptz,
  until timestamptz,
  phones_requested integer not null default 0,
  phones_processed integer not null default 0,
  messages_imported integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists customer_service_learning_import_runs_started_idx
  on public.customer_service_learning_import_runs (environment, started_at desc);

alter table public.customer_service_learning_import_messages enable row level security;
alter table public.customer_service_learning_import_runs enable row level security;
revoke all on table public.customer_service_learning_import_messages from public, anon, authenticated;
revoke all on table public.customer_service_learning_import_runs from public, anon, authenticated;
grant all on table public.customer_service_learning_import_messages to service_role;
grant all on table public.customer_service_learning_import_runs to service_role;

comment on table public.customer_service_learning_import_messages is
  'Backfilled WATI conversations used only by the daily learning report; never read as live bot context.';
comment on column public.customer_service_learning_import_messages.created_at is
  'Original WATI message timestamp, used to group imports into report days.';
