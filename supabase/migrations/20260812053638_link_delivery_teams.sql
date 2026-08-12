create table public.delivery_teams (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  short_name text,
  contact_person text,
  contact_number text,
  status text,
  is_active boolean not null default true,
  bubble_created_at timestamptz,
  bubble_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.delivery_teams enable row level security;

revoke all on public.delivery_teams from anon, authenticated;
grant select, insert, update, delete
  on public.delivery_teams
  to authenticated;
grant all on public.delivery_teams to service_role;

create policy "Operations read delivery teams"
on public.delivery_teams
for select
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin', 'Accounting', 'Factory')
);

create policy "Administrators insert delivery teams"
on public.delivery_teams
for insert
to authenticated
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
);

create policy "Administrators update delivery teams"
on public.delivery_teams
for update
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
)
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
);

create policy "Administrators delete delivery teams"
on public.delivery_teams
for delete
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  in ('Super Admin', 'Admin')
);

alter table public.delivery_districts
  add column driver_team_id uuid
  references public.delivery_teams (id);

create index delivery_districts_driver_team_id_idx
  on public.delivery_districts (driver_team_id);

alter table public.deliveries
  add constraint deliveries_motorcade_id_fkey
  foreign key (motorcade_id)
  references public.delivery_teams (id);

create index deliveries_motorcade_id_idx
  on public.deliveries (motorcade_id);
