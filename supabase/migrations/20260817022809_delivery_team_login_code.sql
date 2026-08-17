-- Bubble DS_Super_Motorcade.Login_code was previously omitted.
-- Store it verbatim for driver login. Authenticated clients may not
-- SELECT, INSERT, or UPDATE this column; service_role retains full access.

alter table public.delivery_teams
  add column if not exists login_code text;

comment on column public.delivery_teams.login_code is
  'Bubble DS_Super_Motorcade.Login_code copied verbatim for driver login.';

revoke select, insert, update on table public.delivery_teams from authenticated;

grant select (
  id,
  legacy_id,
  name,
  short_name,
  contact_person,
  contact_number,
  status,
  is_active,
  bubble_created_at,
  bubble_modified_at,
  created_at,
  updated_at,
  archived_at
) on table public.delivery_teams to authenticated;

grant insert (
  id,
  legacy_id,
  name,
  short_name,
  contact_person,
  contact_number,
  status,
  is_active,
  bubble_created_at,
  bubble_modified_at,
  created_at,
  updated_at,
  archived_at
) on table public.delivery_teams to authenticated;

grant update (
  id,
  legacy_id,
  name,
  short_name,
  contact_person,
  contact_number,
  status,
  is_active,
  bubble_created_at,
  bubble_modified_at,
  created_at,
  updated_at,
  archived_at
) on table public.delivery_teams to authenticated;
