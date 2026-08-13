-- Add phone to application user profiles for admin user management.
alter table public.user_profiles
  add column if not exists phone text;

comment on column public.user_profiles.phone is
  'Contact phone stored as text. Supports country codes, spaces, and local formatting.';

create index if not exists user_profiles_phone_idx
  on public.user_profiles (phone)
  where phone is not null;

-- Keep auth signup/profile sync able to carry phone from user_metadata.
create or replace function private.sync_auth_user_profile()
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
    phone,
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
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    phone = coalesce(excluded.phone, public.user_profiles.phone),
    updated_at = now();

  return new;
end;
$$;
