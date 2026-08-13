-- Application login / auth activity log for Super Admin settings.

create table public.login_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (
      event_type in (
        'login_success',
        'login_failure',
        'logout',
        'password_reset_request'
      )
    ),
  email text,
  user_id uuid references auth.users (id) on delete set null,
  user_name text,
  role text,
  ip_address text,
  user_agent text,
  error_code text,
  created_at timestamptz not null default now()
);

comment on table public.login_logs is
  'Authentication activity recorded for Super Admin review (login, logout, reset).';
comment on column public.login_logs.event_type is
  'login_success | login_failure | logout | password_reset_request';
comment on column public.login_logs.ip_address is
  'Best-effort client IP captured by the login-log edge function.';

create index login_logs_created_at_idx
  on public.login_logs (created_at desc);
create index login_logs_email_idx
  on public.login_logs (lower(email));
create index login_logs_event_type_idx
  on public.login_logs (event_type);
create index login_logs_user_id_idx
  on public.login_logs (user_id)
  where user_id is not null;

alter table public.login_logs enable row level security;

revoke all on table public.login_logs from anon, authenticated;
grant select on table public.login_logs to authenticated;

create policy "Super Admin reads login logs"
on public.login_logs
for select
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

-- Register settings page (reserved / Super Admin only via existing trigger rules).
insert into public.app_pages (
  page_key,
  display_name,
  route,
  sort_order,
  is_high_risk,
  parent_page_key,
  page_kind
)
values (
  'settings.login_logs',
  '登入紀錄',
  '/settings/login-logs',
  125,
  true,
  'settings',
  'subpage'
)
on conflict (page_key) do update
set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

with roles(role) as (
  values
    ('Super Admin'),
    ('Admin'),
    ('Accounting'),
    ('Factory'),
    ('Shop manager'),
    ('Customer_Main'),
    ('Customer_Sub')
)
insert into public.role_page_permissions (
  role,
  page_key,
  can_access,
  can_manage
)
select
  roles.role,
  'settings.login_logs',
  roles.role = 'Super Admin',
  roles.role = 'Super Admin'
from roles
on conflict (role, page_key) do nothing;
