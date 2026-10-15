-- Organization self-service company profile:
--   * admins may maintain the company contact list (immediate),
--   * admins may submit a new BR (number, expiry, attachment) which stays
--     pending until FCCD reviews it; the stored company BR is unchanged until then,
--   * the settlement cycle stays read only.
-- The BR file keeps the existing customer-br-documents bucket, scoped to
-- <uploader uid>/<organization id>/<file>.

create table if not exists public.customer_organization_br_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.customer_organizations(id),
  br_number text not null,
  br_expires_on date not null,
  object_path text not null,
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected')),
  submitted_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists customer_org_br_change_one_pending
  on public.customer_organization_br_change_requests(organization_id)
  where status = 'pending_review';
create index if not exists customer_org_br_change_status_idx
  on public.customer_organization_br_change_requests(status, created_at desc);

alter table public.customer_organization_br_change_requests enable row level security;
revoke all on public.customer_organization_br_change_requests from public, anon, authenticated;
grant all on public.customer_organization_br_change_requests to service_role;

-- Organization admins may upload BR files under their own uid / organization id.
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
  ) or (
    v_parts[2] ~ '^[0-9a-fA-F-]{36}$'
    and exists(
      select 1 from customer_memberships m
      where m.user_id=auth.uid() and m.organization_id=v_parts[2]::uuid and m.is_active and m.role='admin'
    )
  );
end $$;
revoke all on function private.customer_br_upload_allowed(text) from public, anon;
grant execute on function private.customer_br_upload_allowed(text) to authenticated;

-- Company profile plus any pending BR submission for the selected organization.
create or replace function public.customer_portal_company()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
begin
  return jsonb_build_object(
    'name', (select name from customer_organizations where id=v_org),
    'brNumber', coalesce((select br_number from customer_organizations where id=v_org), ''),
    'brExpiresOn', (select br_expires_on from customer_organizations where id=v_org),
    'settlementCycle', (select settlement_cycle from customer_organizations where id=v_org),
    'contacts', coalesce((select jsonb_agg(jsonb_build_object(
      'name', c.name, 'phone', c.phone, 'title', c.title, 'primary', c.is_primary
    ) order by c.is_primary desc, c.created_at)
      from customer_organization_contacts c where c.organization_id=v_org), '[]'::jsonb),
    'pendingBr', (select jsonb_build_object(
      'brNumber', r.br_number, 'brExpiresOn', r.br_expires_on, 'submittedAt', r.created_at
    ) from customer_organization_br_change_requests r
      where r.organization_id=v_org and r.status='pending_review'
      order by r.created_at desc limit 1)
  );
end $$;
revoke all on function public.customer_portal_company() from public, anon;
grant execute on function public.customer_portal_company() to authenticated;

-- Admins replace the company contact list immediately.
create or replace function public.customer_portal_save_company_contacts(p_contacts jsonb)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(true);
begin
  if jsonb_typeof(p_contacts) is distinct from 'array' or jsonb_array_length(p_contacts) > 10 then
    raise exception 'invalid_contact';
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
  delete from customer_organization_contacts where organization_id=v_org;
  insert into customer_organization_contacts(organization_id,name,phone,title,is_primary)
    select v_org, btrim(x.name), btrim(x.phone), btrim(x.title), coalesce(x.is_primary,false)
    from jsonb_to_recordset(p_contacts) as x(name text, phone text, title text, is_primary boolean);
end $$;
revoke all on function public.customer_portal_save_company_contacts(jsonb) from public, anon;
grant execute on function public.customer_portal_save_company_contacts(jsonb) to authenticated;

-- Admins submit a new BR. It replaces any earlier pending request and waits for review.
create or replace function public.customer_portal_submit_company_br(
  p_br_number text, p_br_expires_on date, p_object_path text
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid := private.customer_verified_applicant(); v_org uuid := private.customer_organization(true); v_id uuid;
begin
  if coalesce(p_br_number,'') !~ '^[-A-Za-z0-9]{4,40}$' then raise exception 'invalid_br'; end if;
  if p_br_expires_on is null then raise exception 'invalid_br'; end if;
  if not private.customer_br_path_ok(p_object_path, v_org) then raise exception 'invalid_br_attachment'; end if;
  delete from customer_organization_br_change_requests where organization_id=v_org and status='pending_review';
  insert into customer_organization_br_change_requests(organization_id,br_number,br_expires_on,object_path,submitted_by)
    values(v_org, p_br_number, p_br_expires_on, p_object_path, v_user)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.customer_portal_submit_company_br(text,date,text) from public, anon;
grant execute on function public.customer_portal_submit_company_br(text,date,text) to authenticated;

-- Staff: list BR change requests awaiting review.
create or replace function public.customer_portal_ops_list_br_changes()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'organizationId', r.organization_id,
      'orgName', o.name,
      'brNumber', r.br_number,
      'brExpiresOn', r.br_expires_on,
      'currentBrNumber', o.br_number,
      'currentBrExpiresOn', o.br_expires_on,
      'submittedByEmail', u.email,
      'submittedAt', r.created_at
    ) order by r.created_at desc)
    from customer_organization_br_change_requests r
    join customer_organizations o on o.id=r.organization_id
    left join auth.users u on u.id=r.submitted_by
    where r.status='pending_review'
  ), '[]'::jsonb);
end $$;
revoke all on function public.customer_portal_ops_list_br_changes() from public, anon;
grant execute on function public.customer_portal_ops_list_br_changes() to authenticated;

-- Staff: approve or reject a BR change. Approval updates the company BR.
create or replace function public.customer_portal_ops_review_br_change(
  p_id uuid, p_decision text, p_reason text
) returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_req customer_organization_br_change_requests%rowtype;
begin
  perform private.customer_portal_ops_require(true);
  if p_decision not in ('approved','rejected') or length(btrim(coalesce(p_reason,''))) not between 1 and 500 then
    raise exception 'review_required';
  end if;
  select * into v_req from customer_organization_br_change_requests where id=p_id for update;
  if v_req.id is null then raise exception 'br_change_required'; end if;
  if v_req.status<>'pending_review' then raise exception 'br_change_not_pending'; end if;
  if p_decision='approved' then
    update customer_organizations
      set br_number=v_req.br_number, br_expires_on=v_req.br_expires_on
      where id=v_req.organization_id;
    insert into customer_organization_br_versions(organization_id,br_number,expires_on,object_path,reason,created_by)
      values(v_req.organization_id, v_req.br_number, v_req.br_expires_on, v_req.object_path, btrim(p_reason), auth.uid());
  end if;
  update customer_organization_br_change_requests
    set status=p_decision, review_reason=btrim(p_reason), reviewed_by=auth.uid(), reviewed_at=now()
    where id=v_req.id;
end $$;
revoke all on function public.customer_portal_ops_review_br_change(uuid,text,text) from public, anon;
grant execute on function public.customer_portal_ops_review_br_change(uuid,text,text) to authenticated;
