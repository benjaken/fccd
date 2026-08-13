create table public.app_pages (
  page_key text primary key,
  display_name text not null,
  route text not null unique,
  sort_order integer not null default 0,
  is_high_risk boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_page_permissions (
  role text not null,
  page_key text not null references public.app_pages (page_key) on delete cascade,
  can_access boolean not null default false,
  can_manage boolean not null default false,
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role, page_key),
  check (
    role in (
      'Super Admin',
      'Admin',
      'Accounting',
      'Factory',
      'Shop manager',
      'Customer_Main',
      'Customer_Sub'
    )
  ),
  check (not can_manage or can_access)
);

insert into public.app_pages (
  page_key,
  display_name,
  route,
  sort_order,
  is_high_risk
)
values
  ('overview', '主頁', '/', 10, false),
  ('orders', '訂單', '/orders', 20, false),
  ('quotes', '報價與客戶', '/quotes', 30, false),
  ('products', '商品與套餐', '/products', 40, false),
  ('kitchen', '中央廚房', '/kitchen', 50, false),
  ('delivery', '配送與司機', '/delivery', 60, false),
  ('inventory', '乾貨與庫存', '/inventory', 70, false),
  ('restaurant', '餐廳營運', '/restaurant', 80, false),
  ('reports', '報表', '/reports', 90, false),
  ('finance', '財務對帳', '/finance', 100, true),
  ('settings.users', '使用者列表', '/settings/users', 110, true),
  ('settings.roles', '角色與頁面權限', '/settings/roles', 120, true),
  ('settings.attachments', '附件列表', '/settings/attachments', 130, true),
  ('migration', '資料遷移', '/migration', 140, true);

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
  pages.page_key,
  case
    when roles.role = 'Super Admin' then true
    when pages.page_key like 'settings.%' or pages.page_key = 'migration' then false
    when roles.role = 'Admin' then true
    when roles.role = 'Accounting'
      then pages.page_key in (
        'overview', 'orders', 'quotes', 'restaurant', 'reports', 'finance'
      )
    when roles.role = 'Factory'
      then pages.page_key in (
        'overview', 'orders', 'products', 'kitchen', 'delivery', 'inventory'
      )
    when roles.role = 'Shop manager'
      then pages.page_key in ('overview', 'restaurant')
    else false
  end,
  roles.role = 'Super Admin'
from roles
cross join public.app_pages pages;

create function private.enforce_reserved_page_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'Super Admin' then
    new.can_access := true;
    new.can_manage := true;
  elsif new.page_key like 'settings.%' or new.page_key = 'migration' then
    new.can_access := false;
    new.can_manage := false;
  end if;

  if not new.can_access then
    new.can_manage := false;
  end if;

  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger enforce_reserved_page_permissions
before insert or update on public.role_page_permissions
for each row
execute function private.enforce_reserved_page_permissions();

create function private.set_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_app_pages_updated_at
before update on public.app_pages
for each row
execute function private.set_settings_updated_at();

alter table public.app_pages enable row level security;
alter table public.role_page_permissions enable row level security;

revoke all on table
  public.app_pages,
  public.role_page_permissions
from anon, authenticated;

grant select on table
  public.app_pages,
  public.role_page_permissions
to authenticated;

grant insert, update, delete on table
  public.app_pages,
  public.role_page_permissions
to authenticated;

create policy "Authenticated users read page definitions"
on public.app_pages
for select
to authenticated
using (true);

create policy "Super Admin manages page definitions"
on public.app_pages
for all
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
)
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

create policy "Users read own role permissions"
on public.role_page_permissions
for select
to authenticated
using (
  role = ((select auth.jwt()) -> 'app_metadata' ->> 'role')
  or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

create policy "Super Admin manages role permissions"
on public.role_page_permissions
for all
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
)
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

drop policy if exists "Users read own profile or administrators read all"
  on public.user_profiles;

create policy "Users read own profile or Super Admin reads all"
on public.user_profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

grant select on table public.attachments to authenticated;

create policy "Super Admin reads attachment registry"
on public.attachments
for select
to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

create policy "Super Admin reads private attachment objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'attachments'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'Super Admin'
);

revoke all on function private.enforce_reserved_page_permissions()
  from public, anon, authenticated;
revoke all on function private.set_settings_updated_at()
  from public, anon, authenticated;
