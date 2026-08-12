create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  email_noti boolean not null default false,
  factory_panel_date timestamptz,
  role text,
  shop_restro_legacy_id text,
  user_name text,
  week text,
  week_plus_1 text,
  week_plus_2 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  slug text,
  social_networks jsonb not null default '{}'::jsonb,
  legacy_id text unique
);

comment on table public.user_profiles is
  'Application user data linked one-to-one with Supabase Auth. Passwords remain exclusively in auth.users.';
comment on column public.user_profiles.id is
  'Supabase Auth user UUID and primary identifier.';
comment on column public.user_profiles.email is
  'Read-only mirror of auth.users.email, maintained by an auth trigger.';
comment on column public.user_profiles.legacy_id is
  'Original Bubble unique ID used during migration.';
comment on column public.user_profiles.shop_restro_legacy_id is
  'Original Bubble shop restro unique ID until the restaurant table is migrated.';
comment on column public.user_profiles.social_networks is
  'Compatibility JSON for the requested legacy _social_networks field, which is not exposed by the current Swagger user schema.';

create unique index user_profiles_slug_unique_idx
  on public.user_profiles (lower(slug))
  where slug is not null;
create index user_profiles_role_idx on public.user_profiles (role);
create index user_profiles_shop_restro_legacy_id_idx
  on public.user_profiles (shop_restro_legacy_id);

create function private.set_user_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function private.set_user_profiles_updated_at();

create function private.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    role,
    user_name,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    new.raw_app_meta_data ->> 'role',
    coalesce(
      new.raw_user_meta_data ->> 'user_name',
      new.raw_user_meta_data ->> 'name'
    ),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

create trigger sync_auth_user_profile
after insert or update of email on auth.users
for each row
execute function private.sync_auth_user_profile();

insert into public.user_profiles (
  id,
  email,
  role,
  user_name,
  created_at,
  updated_at
)
select
  id,
  email,
  raw_app_meta_data ->> 'role',
  coalesce(
    raw_user_meta_data ->> 'user_name',
    raw_user_meta_data ->> 'name'
  ),
  coalesce(created_at, now()),
  now()
from auth.users
on conflict (id) do update
set
  email = excluded.email,
  updated_at = now();

alter table public.user_profiles enable row level security;

create policy "Users can read their own profile"
on public.user_profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own editable profile"
on public.user_profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

revoke all on table public.user_profiles from anon, authenticated;
grant select on table public.user_profiles to authenticated;
grant update (
  email_noti,
  factory_panel_date,
  user_name,
  week,
  week_plus_1,
  week_plus_2,
  slug,
  social_networks
) on table public.user_profiles to authenticated;

revoke all on function private.set_user_profiles_updated_at()
  from public, anon, authenticated;
revoke all on function private.sync_auth_user_profile()
  from public, anon, authenticated;
