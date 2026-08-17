-- Table-level INSERT/UPDATE still allowed writing login_code after the
-- column was added. Re-grant DML on every column except login_code.

revoke insert, update on table public.delivery_teams from authenticated;

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
