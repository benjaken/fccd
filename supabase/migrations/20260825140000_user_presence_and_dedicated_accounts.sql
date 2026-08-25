-- User directory indicators: explicit dedicated-account classification and
-- heartbeat-based connection state. Presence is kept separate so heartbeats
-- do not rewrite the profile's business updated_at timestamp.

alter table public.user_profiles
  add column if not exists is_dedicated_account boolean not null default false;

comment on column public.user_profiles.is_dedicated_account is
  'True when the account is assigned exclusively to one person or device.';

create table if not exists public.user_presence (
  user_id uuid primary key references public.user_profiles (id) on delete cascade,
  is_connected boolean not null default true,
  last_seen_at timestamptz not null default now()
);

comment on table public.user_presence is
  'Short-lived application heartbeat used for the user-directory connection indicator.';
comment on column public.user_presence.is_connected is
  'Cleared on explicit global sign-out; stale heartbeats are treated as offline by the client.';

create index if not exists user_presence_last_seen_at_idx
  on public.user_presence (last_seen_at desc);

alter table public.user_presence enable row level security;

revoke all on table public.user_presence from anon, authenticated;
grant select, insert, update on table public.user_presence to authenticated;

drop policy if exists "Users insert own presence" on public.user_presence;
create policy "Users insert own presence"
on public.user_presence
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own presence" on public.user_presence;
create policy "Users update own presence"
on public.user_presence
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users read own presence or user managers read all"
  on public.user_presence;
create policy "Users read own presence or user managers read all"
on public.user_presence
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or private.has_page_access('settings.users')
);
