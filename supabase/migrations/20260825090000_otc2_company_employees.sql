begin;

-- Active OTC2 staff are mirrored here. Authentication remains a separate,
-- explicit concern: only rows matched to an existing FCCD account get a
-- linked_user_id.
create table if not exists public.company_employees (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'otc2',
  source_staff_id bigint not null,
  display_name text,
  full_name text,
  chinese_name text,
  work_email text,
  company_phone text,
  private_email text,
  private_phone text,
  entry_date date,
  termination_date date,
  base_location text,
  company_id bigint,
  company text,
  brand_ids uuid[] not null default '{}',
  team_id text,
  team_name text,
  position text,
  image_url text,
  source_role text,
  source_status text not null default 'Active',
  is_active boolean not null default true,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  linked_user_id uuid unique references auth.users(id) on delete set null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_staff_id)
);

create index if not exists company_employees_active_name_idx
  on public.company_employees (is_active, display_name);
create index if not exists company_employees_company_idx
  on public.company_employees (company) where is_active;
create index if not exists company_employees_work_email_idx
  on public.company_employees (lower(work_email)) where work_email is not null;

comment on table public.company_employees is
  'OTC2 staff directory mirror. Active source rows are refreshed daily; FCCD login accounts are linked explicitly.';
comment on column public.company_employees.source_staff_id is
  'Stable OTC2 public.staff_sync.staff_id identity; never use a reusable company email as the employee key.';

create or replace function private.set_company_employees_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_company_employees_updated_at on public.company_employees;
create trigger set_company_employees_updated_at
before update on public.company_employees
for each row execute function private.set_company_employees_updated_at();

-- Track login state in the application profile as an auditable companion to
-- the Auth ban applied by the sync function.
alter table public.user_profiles
  add column if not exists login_enabled boolean not null default true,
  add column if not exists login_disabled_at timestamptz,
  add column if not exists login_disabled_reason text;

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk,
  parent_page_key, page_kind
)
values (
  'settings.employees', '員工列表', '/settings/employees', 111, true,
  'settings', 'subpage'
)
on conflict (page_key) do update
set display_name = excluded.display_name,
    route = excluded.route,
    sort_order = excluded.sort_order,
    is_high_risk = excluded.is_high_risk,
    parent_page_key = excluded.parent_page_key,
    page_kind = excluded.page_kind,
    updated_at = now();

-- Register Company User throughout the permission matrix. It starts with no
-- application-page access; Super Admin can grant only what is required.
alter table public.role_page_permissions
  drop constraint if exists role_page_permissions_role_check;
alter table public.role_page_permissions
  add constraint role_page_permissions_role_check
  check (role in (
    'Super Admin', 'Admin', 'Accounting', 'Factory', 'Shop manager',
    'Customer_Main', 'Customer_Sub', 'Company User'
  ));

insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select 'Company User', page.page_key, false, false
from public.app_pages page
on conflict (role, page_key) do nothing;

with roles(role) as (
  values
    ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'),
    ('Shop manager'), ('Customer_Main'), ('Customer_Sub'), ('Company User')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select role, 'settings.employees', role = 'Super Admin', role = 'Super Admin'
from roles
on conflict (role, page_key) do update
set can_access = excluded.can_access,
    can_manage = excluded.can_manage;

alter table public.company_employees enable row level security;
revoke all on table public.company_employees from anon, authenticated;
grant select on table public.company_employees to authenticated;

drop policy if exists "Employee list readers" on public.company_employees;
create policy "Employee list readers"
on public.company_employees
for select
to authenticated
using (private.has_page_access('settings.employees'));

revoke all on function private.set_company_employees_updated_at()
  from public, anon, authenticated;

-- pg_cron is UTC. Run at 02:30 Asia/Hong_Kong, after the existing overnight
-- integrations. The secret is compared against the stored cron hash by the
-- Edge Function and is never embedded in this migration.
select cron.unschedule(jobid)
from cron.job
where jobname = 'fccd-otc2-company-employee-daily-sync';

select cron.schedule(
  'fccd-otc2-company-employee-daily-sync',
  '30 18 * * *',
  $$
    select net.http_post(
      url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/otc2-staff-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'bubble_daily_cron_secret' limit 1
        )
      ),
      body := '{"source":"daily_cron"}'::jsonb,
      timeout_milliseconds := 90000
    );
  $$
);

commit;
