-- v1.9 company applications: BR review before any organization membership exists.
alter table public.customer_organizations
  add column if not exists settlement_cycle text,
  add column if not exists br_number text,
  add column if not exists br_expires_on date;
alter table public.customer_organizations
  drop constraint if exists customer_organizations_settlement_cycle_check;
alter table public.customer_organizations
  add constraint customer_organizations_settlement_cycle_check
  check (settlement_cycle is null or settlement_cycle in ('weekly','semi_monthly','monthly'));

create table public.customer_organization_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references auth.users(id),
  status text not null default 'draft' check (status in ('draft','pending_review','needs_info','rejected','approved')),
  company_name text not null check (length(btrim(company_name)) between 1 and 120),
  br_number text not null default '',
  br_expires_on date,
  br_object_path text,
  organization_id uuid references public.customer_organizations(id),
  settlement_cycle text check (settlement_cycle is null or settlement_cycle in ('weekly','semi_monthly','monthly')),
  first_admin_user_id uuid references auth.users(id),
  review_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customer_org_applications_one_open
  on public.customer_organization_applications(applicant_user_id)
  where status in ('draft','pending_review','needs_info');
create index customer_org_applications_status_idx
  on public.customer_organization_applications(status, updated_at desc);

create table public.customer_organization_br_versions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.customer_organization_applications(id),
  organization_id uuid references public.customer_organizations(id),
  br_number text not null,
  expires_on date not null,
  object_path text not null,
  reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (application_id is not null or organization_id is not null)
);

create table public.customer_organization_contacts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.customer_organization_applications(id),
  organization_id uuid references public.customer_organizations(id),
  name text not null,
  phone text not null,
  title text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  check (application_id is not null or organization_id is not null)
);

create table public.customer_organization_application_addresses (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.customer_organization_applications(id) on delete cascade,
  label text not null,
  recipient text not null,
  phone text not null,
  address text not null,
  created_at timestamptz not null default now()
);

create table public.customer_br_expiry_policies (
  id uuid primary key default gen_random_uuid(),
  reminder_lead_days integer not null check (reminder_lead_days between 1 and 365),
  block_new_orders_when_expired boolean not null,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  published_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.customer_organization_applications enable row level security;
alter table public.customer_organization_br_versions enable row level security;
alter table public.customer_organization_contacts enable row level security;
alter table public.customer_organization_application_addresses enable row level security;
alter table public.customer_br_expiry_policies enable row level security;
revoke all on public.customer_organization_applications from anon, authenticated;
revoke all on public.customer_organization_br_versions from anon, authenticated;
revoke all on public.customer_organization_contacts from anon, authenticated;
revoke all on public.customer_organization_application_addresses from anon, authenticated;
revoke all on public.customer_br_expiry_policies from anon, authenticated;
grant all on public.customer_organization_applications to service_role;
grant all on public.customer_organization_br_versions to service_role;
grant all on public.customer_organization_contacts to service_role;
grant all on public.customer_organization_application_addresses to service_role;
grant all on public.customer_br_expiry_policies to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('customer-br-documents','customer-br-documents',false,10485760,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do nothing;

create or replace function private.customer_verified_applicant()
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_id is null then raise exception 'email_verification_required' using errcode='42501'; end if;
  return v_id;
end $$;
revoke all on function private.customer_verified_applicant() from public, anon, authenticated;

create or replace function private.customer_br_path_ok(p_path text, p_scope uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_parts text[] := string_to_array(coalesce(p_path,''),'/');
begin
  return array_length(v_parts,1)=3
    and v_parts[1]=auth.uid()::text
    and v_parts[2]=p_scope::text
    and v_parts[3] ~ '^[A-Za-z0-9._-]{1,120}$'
    and lower(v_parts[3]) ~ '\.(jpg|jpeg|png|pdf)$'
    and exists(select 1 from storage.objects where bucket_id='customer-br-documents' and name=p_path);
end $$;
revoke all on function private.customer_br_path_ok(text, uuid) from public, anon, authenticated;

create or replace function private.customer_br_upload_allowed(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_parts text[] := string_to_array(coalesce(p_path,''),'/');
begin
  if array_length(v_parts,1)<>3 or v_parts[1] is distinct from auth.uid()::text
    or v_parts[3] !~ '^[A-Za-z0-9._-]{1,120}$' or lower(v_parts[3]) !~ '\.(jpg|jpeg|png|pdf)$' then
    return false;
  end if;
  return exists(
    select 1 from customer_organization_applications
    where id::text=v_parts[2] and applicant_user_id=auth.uid() and status in ('draft','needs_info')
  ) or (
    (private.has_page_access('settings.customer_portal.edit') or private.has_page_manage('settings.customer_portal'))
    and exists(select 1 from customer_organizations where id::text=v_parts[2])
  );
end $$;
revoke all on function private.customer_br_upload_allowed(text) from public, anon;
grant execute on function private.customer_br_upload_allowed(text) to authenticated;

create or replace function private.customer_br_read_allowed(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_parts text[] := string_to_array(coalesce(p_path,''),'/');
begin
  if array_length(v_parts,1)<>3 then return false; end if;
  return v_parts[1]=auth.uid()::text
    or private.has_page_access('settings.customer_portal')
    or private.has_page_manage('settings.customer_portal');
end $$;
revoke all on function private.customer_br_read_allowed(text) from public, anon;
grant execute on function private.customer_br_read_allowed(text) to authenticated;

alter table storage.objects enable row level security;
drop policy if exists "Customer BR document inserts" on storage.objects;
drop policy if exists "Customer BR document updates" on storage.objects;
drop policy if exists "Customer BR document reads" on storage.objects;
create policy "Customer BR document inserts" on storage.objects for insert to authenticated
  with check (bucket_id='customer-br-documents' and private.customer_br_upload_allowed(name));
create policy "Customer BR document updates" on storage.objects for update to authenticated
  using (bucket_id='customer-br-documents' and private.customer_br_upload_allowed(name))
  with check (bucket_id='customer-br-documents' and private.customer_br_upload_allowed(name));
create policy "Customer BR document reads" on storage.objects for select to authenticated
  using (bucket_id='customer-br-documents' and private.customer_br_read_allowed(name));

create or replace function private.customer_br_blocks_new_orders(p_org uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((
    select p.block_new_orders_when_expired
      and o.br_expires_on is not null
      and o.br_expires_on < (now() at time zone 'Asia/Hong_Kong')::date
    from customer_organizations o
    cross join lateral (
      select block_new_orders_when_expired
      from customer_br_expiry_policies
      where published_at is not null
      order by published_at desc, created_at desc
      limit 1
    ) p
    where o.id=p_org
  ), false);
$$;
revoke all on function private.customer_br_blocks_new_orders(uuid) from public, anon, authenticated;

create or replace function private.customer_portal_orders_enforce_br()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if private.customer_br_blocks_new_orders(new.organization_id) then
    raise exception 'br_expired' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.customer_portal_orders_enforce_br() from public, anon, authenticated;
drop trigger if exists customer_portal_orders_br_guard on public.customer_portal_orders;
create trigger customer_portal_orders_br_guard
  before insert on public.customer_portal_orders
  for each row execute function private.customer_portal_orders_enforce_br();

create or replace function private.customer_application_replace_children(
  p_id uuid, p_contacts jsonb, p_addresses jsonb
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if jsonb_typeof(p_contacts) is distinct from 'array' or jsonb_array_length(p_contacts) > 10
    or jsonb_typeof(p_addresses) is distinct from 'array' or jsonb_array_length(p_addresses) > 20 then
    raise exception 'invalid_application';
  end if;
  if exists(
    select 1 from jsonb_to_recordset(p_contacts) as x(name text, phone text, title text, is_primary boolean)
    where length(btrim(coalesce(x.name,''))) not between 1 and 80
      or length(btrim(coalesce(x.title,''))) not between 1 and 80
      or coalesce(x.phone,'') !~ '^\+?[0-9 -]{8,20}$'
  ) then raise exception 'invalid_contact'; end if;
  if (
    select count(*) filter (where coalesce(is_primary,false))
    from jsonb_to_recordset(p_contacts) as x(name text, phone text, title text, is_primary boolean)
  ) > 1 then raise exception 'invalid_contact'; end if;
  if exists(
    select 1 from jsonb_to_recordset(p_addresses) as x(label text, recipient text, phone text, address text)
    where length(btrim(coalesce(x.label,''))) not between 1 and 80
      or length(btrim(coalesce(x.recipient,''))) not between 1 and 100
      or coalesce(x.phone,'') !~ '^\+?[0-9 -]{8,20}$'
      or length(btrim(coalesce(x.address,''))) not between 5 and 500
  ) then raise exception 'invalid_address'; end if;
  delete from customer_organization_contacts where application_id=p_id;
  delete from customer_organization_application_addresses where application_id=p_id;
  insert into customer_organization_contacts(application_id,name,phone,title,is_primary)
    select p_id, btrim(x.name), btrim(x.phone), btrim(x.title), coalesce(x.is_primary,false)
    from jsonb_to_recordset(p_contacts) as x(name text, phone text, title text, is_primary boolean);
  insert into customer_organization_application_addresses(application_id,label,recipient,phone,address)
    select p_id, btrim(x.label), btrim(x.recipient), btrim(x.phone), btrim(x.address)
    from jsonb_to_recordset(p_addresses) as x(label text, recipient text, phone text, address text);
end $$;
revoke all on function private.customer_application_replace_children(uuid, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.customer_org_application_current()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_user uuid := private.customer_verified_applicant(); v_id uuid;
begin
  select id into v_id from customer_organization_applications
    where applicant_user_id=v_user
    order by case when status in ('draft','pending_review','needs_info') then 0 else 1 end, updated_at desc
    limit 1;
  if v_id is null then return 'null'::jsonb; end if;
  return (
    select jsonb_build_object(
      'id',a.id,'status',a.status,'company_name',a.company_name,'br_number',a.br_number,
      'br_expires_on',a.br_expires_on,'br_object_path',a.br_object_path,
      'organization_id',a.organization_id,'settlement_cycle',a.settlement_cycle,
      'review_reason',a.review_reason,'reviewed_at',a.reviewed_at,'updated_at',a.updated_at,
      'contacts',coalesce((select jsonb_agg(jsonb_build_object(
        'id',c.id,'name',c.name,'phone',c.phone,'title',c.title,'is_primary',c.is_primary
      ) order by c.is_primary desc, c.created_at) from customer_organization_contacts c where c.application_id=a.id),'[]'),
      'addresses',coalesce((select jsonb_agg(jsonb_build_object(
        'id',d.id,'label',d.label,'recipient',d.recipient,'phone',d.phone,'address',d.address
      ) order by d.created_at) from customer_organization_application_addresses d where d.application_id=a.id),'[]')
    ) from customer_organization_applications a where a.id=v_id
  );
end $$;

create or replace function public.customer_org_application_save(
  p_company_name text, p_br_number text, p_br_expires_on date, p_br_object_path text,
  p_contacts jsonb, p_addresses jsonb
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid := private.customer_verified_applicant(); v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(v_user::text)::bigint);
  if exists(select 1 from customer_memberships where user_id=v_user and is_active) then
    raise exception 'membership_exists';
  end if;
  if length(btrim(coalesce(p_company_name,''))) not between 1 and 120 then raise exception 'invalid_application'; end if;
  if coalesce(p_br_number,'')<>'' and p_br_number !~ '^[-A-Za-z0-9]{4,40}$' then raise exception 'invalid_br'; end if;
  if exists(select 1 from customer_organization_applications where applicant_user_id=v_user and status='pending_review') then
    raise exception 'application_locked';
  end if;
  select id into v_id from customer_organization_applications
    where applicant_user_id=v_user and status in ('draft','needs_info')
    order by updated_at desc limit 1 for update;
  if v_id is null then
    if exists(select 1 from customer_organization_applications where applicant_user_id=v_user and status='approved') then
      raise exception 'application_already_approved';
    end if;
    insert into customer_organization_applications(applicant_user_id,company_name,br_number,br_expires_on)
      values(v_user,btrim(p_company_name),coalesce(p_br_number,''),p_br_expires_on)
      returning id into v_id;
  else
    update customer_organization_applications
      set company_name=btrim(p_company_name), br_number=coalesce(p_br_number,''), br_expires_on=p_br_expires_on, updated_at=now()
      where id=v_id;
  end if;
  if nullif(p_br_object_path,'') is not null then
    if not private.customer_br_path_ok(p_br_object_path, v_id) then raise exception 'invalid_br_attachment'; end if;
    update customer_organization_applications set br_object_path=p_br_object_path, updated_at=now() where id=v_id;
  end if;
  perform private.customer_application_replace_children(v_id, coalesce(p_contacts,'[]'::jsonb), coalesce(p_addresses,'[]'::jsonb));
  return v_id;
end $$;

create or replace function public.customer_org_application_submit()
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid := private.customer_verified_applicant(); v_app customer_organization_applications%rowtype;
  v_block boolean;
begin
  perform pg_advisory_xact_lock(hashtext(v_user::text)::bigint);
  if exists(select 1 from customer_memberships where user_id=v_user and is_active) then
    raise exception 'membership_exists';
  end if;
  select * into v_app from customer_organization_applications
    where applicant_user_id=v_user and status in ('draft','needs_info')
    order by updated_at desc limit 1 for update;
  if v_app.id is null then raise exception 'application_required'; end if;
  if v_app.br_number !~ '^[-A-Za-z0-9]{4,40}$' or v_app.br_expires_on is null then
    raise exception 'invalid_br';
  end if;
  if not private.customer_br_path_ok(v_app.br_object_path, v_app.id) then
    raise exception 'invalid_br_attachment';
  end if;
  if (select count(*) from customer_organization_contacts where application_id=v_app.id) < 1
    or (select count(*) from customer_organization_contacts where application_id=v_app.id and is_primary) <> 1
    or (select count(*) from customer_organization_application_addresses where application_id=v_app.id) < 1 then
    raise exception 'invalid_application';
  end if;
  select block_new_orders_when_expired into v_block
    from customer_br_expiry_policies where published_at is not null
    order by published_at desc, created_at desc limit 1;
  if coalesce(v_block,false) and v_app.br_expires_on < (now() at time zone 'Asia/Hong_Kong')::date then
    raise exception 'br_expired';
  end if;
  insert into customer_organization_br_versions(application_id,br_number,expires_on,object_path,created_by)
    values(v_app.id,v_app.br_number,v_app.br_expires_on,v_app.br_object_path,v_user);
  update customer_organization_applications
    set status='pending_review', review_reason=null, reviewed_by=null, reviewed_at=null, updated_at=now()
    where id=v_app.id;
  return v_app.id;
end $$;

create or replace function public.customer_portal_ops_list_applications()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',a.id,'company_name',a.company_name,'status',a.status,'br_number',a.br_number,
    'br_expires_on',a.br_expires_on,'applicant_email',u.email,'organization_id',a.organization_id,
    'review_reason',a.review_reason,'updated_at',a.updated_at
  ) order by a.updated_at desc)
    from customer_organization_applications a
    join auth.users u on u.id=a.applicant_user_id),'[]'::jsonb);
end $$;

create or replace function public.customer_portal_ops_get_application(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  if p_id is null or not exists(select 1 from customer_organization_applications where id=p_id) then
    raise exception 'application_required';
  end if;
  return (
    select jsonb_build_object(
      'id',a.id,'company_name',a.company_name,'status',a.status,'br_number',a.br_number,
      'br_expires_on',a.br_expires_on,'br_object_path',a.br_object_path,'applicant_email',u.email,
      'organization_id',a.organization_id,'settlement_cycle',a.settlement_cycle,
      'review_reason',a.review_reason,'reviewed_at',a.reviewed_at,'updated_at',a.updated_at,
      'contacts',coalesce((select jsonb_agg(jsonb_build_object(
        'name',c.name,'phone',c.phone,'title',c.title,'is_primary',c.is_primary
      ) order by c.is_primary desc, c.created_at) from customer_organization_contacts c where c.application_id=a.id),'[]'),
      'addresses',coalesce((select jsonb_agg(jsonb_build_object(
        'label',d.label,'recipient',d.recipient,'phone',d.phone,'address',d.address
      ) order by d.created_at) from customer_organization_application_addresses d where d.application_id=a.id),'[]'),
      'versions',coalesce((select jsonb_agg(jsonb_build_object(
        'id',v.id,'br_number',v.br_number,'expires_on',v.expires_on,'object_path',v.object_path,'created_at',v.created_at
      ) order by v.created_at desc) from customer_organization_br_versions v where v.application_id=a.id),'[]')
    ) from customer_organization_applications a join auth.users u on u.id=a.applicant_user_id where a.id=p_id
  );
end $$;

create or replace function public.customer_portal_ops_review_application(
  p_id uuid, p_decision text, p_reason text, p_settlement_cycle text, p_admin_email text
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
  v_app customer_organization_applications%rowtype;
  v_org uuid; v_admin uuid; v_email text; v_existing customer_memberships%rowtype;
begin
  perform private.customer_portal_ops_require(true);
  if p_decision not in ('needs_info','rejected','approved') or length(btrim(coalesce(p_reason,''))) not between 1 and 500 then
    raise exception 'review_required';
  end if;
  select * into v_app from customer_organization_applications where id=p_id for update;
  if v_app.id is null then raise exception 'application_required'; end if;
  if v_app.status='approved' then return v_app.organization_id; end if;
  if v_app.status<>'pending_review' then raise exception 'application_not_pending'; end if;
  if p_decision<>'approved' then
    update customer_organization_applications
      set status=p_decision, review_reason=btrim(p_reason), reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now()
      where id=v_app.id;
    return null;
  end if;
  if p_settlement_cycle not in ('weekly','semi_monthly','monthly') then raise exception 'invalid_settlement_cycle'; end if;
  if p_admin_email is null or p_admin_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email';
  end if;
  v_email := lower(btrim(p_admin_email));
  select id into v_admin from auth.users where lower(email)=v_email and email_confirmed_at is not null;
  if v_admin is null then raise exception 'user_not_found'; end if;
  select * into v_existing from customer_memberships where user_id=v_admin;
  if v_existing.user_id is not null then raise exception 'membership_conflict'; end if;
  insert into customer_organizations(name,is_active,settlement_cycle,br_number,br_expires_on)
    values(v_app.company_name,true,p_settlement_cycle,v_app.br_number,v_app.br_expires_on)
    returning id into v_org;
  insert into customer_memberships(user_id,organization_id,role,is_active)
    values(v_admin,v_org,'admin',true);
  update customer_organization_contacts set organization_id=v_org where application_id=v_app.id;
  insert into customer_addresses(organization_id,label,recipient,phone,address,created_by)
    select v_org,label,recipient,phone,address,auth.uid()
    from customer_organization_application_addresses where application_id=v_app.id;
  update customer_organization_br_versions set organization_id=v_org where application_id=v_app.id;
  update customer_organization_applications
    set status='approved', organization_id=v_org, settlement_cycle=p_settlement_cycle,
      first_admin_user_id=v_admin, review_reason=btrim(p_reason), reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now()
    where id=v_app.id;
  return v_org;
end $$;

create or replace function public.customer_portal_ops_br_policy()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((
    select jsonb_build_object(
      'id',id,'reminder_lead_days',reminder_lead_days,
      'block_new_orders_when_expired',block_new_orders_when_expired,
      'reason',reason,'published_at',published_at
    ) from customer_br_expiry_policies
    order by published_at desc, created_at desc limit 1
  ), 'null'::jsonb);
end $$;

create or replace function public.customer_portal_ops_publish_br_policy(
  p_reminder_lead_days integer, p_block_new_orders boolean, p_reason text
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid;
begin
  perform private.customer_portal_ops_require(true);
  if p_reminder_lead_days is null or p_reminder_lead_days not between 1 and 365
    or p_block_new_orders is null or length(btrim(coalesce(p_reason,''))) not between 1 and 500 then
    raise exception 'invalid_br_policy';
  end if;
  insert into customer_br_expiry_policies(reminder_lead_days,block_new_orders_when_expired,reason,created_by)
    values(p_reminder_lead_days,p_block_new_orders,btrim(p_reason),auth.uid())
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.customer_portal_ops_renew_br(
  p_org_id uuid, p_br_number text, p_expires_on date, p_object_path text, p_reason text
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid;
begin
  perform private.customer_portal_ops_require(true);
  if p_org_id is null or not exists(select 1 from customer_organizations where id=p_org_id) then
    raise exception 'organization_required';
  end if;
  if p_br_number is null or p_br_number !~ '^[-A-Za-z0-9]{4,40}$' or p_expires_on is null
    or length(btrim(coalesce(p_reason,''))) not between 1 and 500
    or not private.customer_br_path_ok(p_object_path, p_org_id) then
    raise exception 'invalid_br';
  end if;
  insert into customer_organization_br_versions(organization_id,br_number,expires_on,object_path,reason,created_by)
    values(p_org_id,p_br_number,p_expires_on,p_object_path,btrim(p_reason),auth.uid())
    returning id into v_id;
  update customer_organizations set br_number=p_br_number, br_expires_on=p_expires_on where id=p_org_id;
  return v_id;
end $$;

do $$ declare signature text; begin
  foreach signature in array array[
    'customer_org_application_current()',
    'customer_org_application_save(text,text,date,text,jsonb,jsonb)',
    'customer_org_application_submit()',
    'customer_portal_ops_list_applications()',
    'customer_portal_ops_get_application(uuid)',
    'customer_portal_ops_review_application(uuid,text,text,text,text)',
    'customer_portal_ops_br_policy()',
    'customer_portal_ops_publish_br_policy(integer,boolean,text)',
    'customer_portal_ops_renew_br(uuid,text,date,text,text)'
  ] loop
    execute 'revoke all on function public.'||signature||' from public,anon';
    execute 'grant execute on function public.'||signature||' to authenticated';
  end loop;
end $$;
