-- One person may belong to several organizations. The selected organization scopes orders, addresses and points.

alter table public.customer_memberships drop constraint customer_memberships_pkey;
alter table public.customer_memberships add primary key (user_id, organization_id);

create table if not exists public.customer_portal_active_organizations (
  user_id uuid primary key references auth.users(id),
  organization_id uuid not null references public.customer_organizations(id)
);
alter table public.customer_portal_active_organizations enable row level security;
revoke all on public.customer_portal_active_organizations from public, anon, authenticated;
grant all on public.customer_portal_active_organizations to service_role;

create or replace function private.customer_organization(p_admin boolean default false)
returns uuid language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_id uuid; v_role text;
begin
  select m.organization_id, m.role into v_id, v_role
  from public.customer_memberships m
  join public.customer_organizations o on o.id=m.organization_id and o.is_active
  join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
  left join public.customer_portal_active_organizations a on a.user_id=m.user_id
  where m.user_id=auth.uid() and m.is_active
  order by (m.organization_id is not distinct from a.organization_id) desc, m.created_at
  limit 1;
  if v_id is null or (p_admin and v_role is distinct from 'admin') then
    raise exception 'customer_membership_required' using errcode='P0001';
  end if;
  return v_id;
end $$;

create or replace function public.customer_portal_identities()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_user uuid := auth.uid(); v_active uuid; v_name text; v_orgs jsonb;
begin
  if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null) then
    raise exception 'email_verification_required' using errcode='P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role) order by o.name), '[]')
    into v_orgs
  from customer_memberships m
  join customer_organizations o on o.id=m.organization_id and o.is_active
  where m.user_id=v_user and m.is_active;
  begin
    v_active := private.customer_organization();
    select name into v_name from customer_organizations where id=v_active;
  exception when others then
    v_active := null;
  end;
  return jsonb_build_object(
    'personal', true,
    'organization', jsonb_array_length(v_orgs) > 0,
    'organizationName', v_name,
    'activeOrganizationId', v_active,
    'organizations', v_orgs
  );
end $$;

create or replace function public.customer_portal_select_organization(p_organization_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null) then
    raise exception 'email_verification_required' using errcode='P0001';
  end if;
  if not exists(select 1 from customer_memberships m join customer_organizations o on o.id=m.organization_id and o.is_active
    where m.user_id=v_user and m.organization_id=p_organization_id and m.is_active) then
    raise exception 'customer_membership_required' using errcode='P0001';
  end if;
  insert into customer_portal_active_organizations(user_id, organization_id)
    values(v_user, p_organization_id)
  on conflict (user_id) do update set organization_id=excluded.organization_id;
end $$;
revoke all on function public.customer_portal_select_organization(uuid) from public, anon;
grant execute on function public.customer_portal_select_organization(uuid) to authenticated;

create or replace function public.customer_portal_ops_assign_admin(p_org_id uuid, p_email text)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid; v_email text;
begin
  perform private.customer_portal_ops_require(true);
  if p_org_id is null or not exists(select 1 from customer_organizations where id=p_org_id) then
    raise exception 'organization_required';
  end if;
  if p_email is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email';
  end if;
  v_email := lower(btrim(p_email));
  select id into v_user from auth.users where lower(email)=v_email and email_confirmed_at is not null;
  if v_user is null then raise exception 'user_not_found'; end if;
  insert into customer_memberships(user_id, organization_id, role, is_active)
    values(v_user, p_org_id, 'admin', true)
  on conflict (user_id, organization_id) do update set role='admin', is_active=true;
  insert into customer_portal_active_organizations(user_id, organization_id)
    values(v_user, p_org_id) on conflict (user_id) do nothing;
  return v_user;
end $$;

create or replace function public.customer_portal_accept_invite(p_token text)
returns void language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare v_inv customer_invitations%rowtype; v_email text;
begin
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'email_verification_required'; end if;
  select * into v_inv from customer_invitations where token_hash=digest(p_token,'sha256')
    and email=v_email and accepted_at is null and revoked_at is null and expires_at>now() for update;
  if v_inv.id is null or not exists(select 1 from customer_organizations where id=v_inv.organization_id and is_active) then
    raise exception 'invalid_invitation';
  end if;
  insert into customer_memberships(user_id, organization_id) values(auth.uid(), v_inv.organization_id)
  on conflict (user_id, organization_id) do update set is_active=true;
  insert into customer_portal_active_organizations(user_id, organization_id)
    values(auth.uid(), v_inv.organization_id)
  on conflict (user_id) do update set organization_id=excluded.organization_id;
  update customer_invitations set accepted_at=now() where id=v_inv.id;
end $$;

create or replace function public.customer_portal_snapshot()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_role text;
begin
  select role into v_role from customer_memberships where user_id=auth.uid() and organization_id=v_org and is_active;
  return jsonb_build_object(
    'organization', (select jsonb_build_object('id',id,'name',name) from customer_organizations where id=v_org),
    'role',v_role, 'balance',private.customer_reward_balance(v_org),
    'addresses',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from customer_addresses a where organization_id=v_org and archived_at is null),'[]'),
    'members', case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,'role',m.role,'is_active',m.is_active,
      'menu_ids',coalesce((select jsonb_agg(s.menu_id order by s.menu_id)
        from customer_member_menu_scopes s
        where s.organization_id=v_org and s.user_id=m.user_id),'[]'::jsonb)
    ) order by m.created_at)
      from customer_memberships m join auth.users u on u.id=m.user_id where m.organization_id=v_org),'[]') else '[]'::jsonb end,
    'org_menus', case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.name,'brand',c.name,'delivery_date',a.delivery_date,'is_active',a.is_active
    ) order by a.delivery_date desc, a.name)
      from customer_menu_assignments a
      join channels c on c.id=a.channel_id
      where a.organization_id=v_org and a.is_active),'[]') else '[]'::jsonb end,
    'invitations', case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'expires_at',i.expires_at,'created_at',i.created_at) order by i.created_at desc)
      from customer_invitations i
      where i.organization_id=v_org and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()),'[]')
      else '[]'::jsonb end,
    'templates', coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'name',t.name,'updated_at',t.updated_at,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'product_id',i.product_id,
        'name',coalesce(nullif(p.chinese_name,''),p.name),
        'quantity',i.quantity) order by coalesce(nullif(p.chinese_name,''),p.name))
        from customer_order_template_items i
        join products p on p.id=i.product_id
        where i.template_id=t.id),'[]')) order by t.updated_at desc, t.name)
      from customer_order_templates t
      where t.organization_id=v_org and t.archived_at is null),'[]'),
    'menus',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'name',m.name,'brand',c.name,'channel_id',m.channel_id,
      'delivery_date',m.delivery_date,'delivery_time',m.delivery_time,'cutoff_at',m.cutoff_at,'shipping_fee',m.shipping_fee,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product_id',p.id,'name',coalesce(nullif(p.chinese_name,''),p.name),
        'unit_price',i.unit_price,'available_quantity',i.available_quantity) order by p.name)
        from customer_menu_items i join products p on p.id=i.product_id
        where i.menu_id=m.id and p.channel_id=m.channel_id and p.is_active and p.archived_at is null),'[]')) order by m.delivery_date,m.name)
      from customer_menu_assignments m join channels c on c.id=m.channel_id and c.is_active and c.archived_at is null
      where m.organization_id=v_org and m.is_active and m.cutoff_at>now()
        and (
          v_role='admin'
          or not exists(
            select 1 from customer_member_menu_scopes s
            where s.organization_id=v_org and s.user_id=auth.uid()
          )
          or exists(
            select 1 from customer_member_menu_scopes s
            where s.organization_id=v_org and s.user_id=auth.uid() and s.menu_id=m.id
          )
        )),'[]'),
    'orders',coalesce((select jsonb_agg(jsonb_build_object('id',live.id,'number',live.order_number,'delivery_at',live.delivery_at,
      'status',live.delivery_status,
      'stage',case when live.document_type in ('quote','unconfirmed') then 'quote' else 'order' end,
      'total',live.grand_total,'outstanding',live.outstanding,'brand',c.name,
      'points_used',po.points_used,'cancel_status',cr.status,
      'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',l.product_id,'name',l.product_name_snapshot,
        'quantity',l.quantity,'unit_price',l.unit_price)) from order_lines l where l.order_id=live.id and not l.is_void),'[]')) order by live.created_at desc)
      from customer_portal_orders po
      join orders linked on linked.id=po.order_id
      left join lateral (
        select n.id from orders n
        where n.source_quote_id=linked.id and n.document_type='order' and n.archived_at is null
        order by n.created_at desc limit 1
      ) converted on true
      join orders live on live.id=coalesce(converted.id, linked.id)
      join channels c on c.id=live.channel_id
      left join customer_cancel_requests cr on cr.order_id=live.id
      where po.organization_id=v_org and live.archived_at is null),'[]'),
    'ledger',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from
      (select id,points,kind,order_id,actor_id,expires_at,created_at from customer_reward_entries
        where organization_id=v_org order by created_at desc limit 100) e),'[]')
  );
end $$;

create or replace function public.customer_org_application_save(
  p_company_name text, p_br_number text, p_br_expires_on date, p_br_object_path text,
  p_contacts jsonb, p_addresses jsonb
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid := private.customer_verified_applicant(); v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(v_user::text)::bigint);
  if length(btrim(coalesce(p_company_name,''))) not between 1 and 120 then raise exception 'invalid_application'; end if;
  if coalesce(p_br_number,'')<>'' and p_br_number !~ '^[-A-Za-z0-9]{4,40}$' then raise exception 'invalid_br'; end if;
  if exists(select 1 from customer_organization_applications where applicant_user_id=v_user and status='pending_review') then
    raise exception 'application_locked';
  end if;
  select id into v_id from customer_organization_applications
    where applicant_user_id=v_user and status in ('draft','needs_info')
    order by updated_at desc limit 1 for update;
  if v_id is null then
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

create or replace function public.customer_portal_ops_review_application(
  p_id uuid, p_decision text, p_reason text, p_settlement_cycle text, p_admin_email text
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
  v_app customer_organization_applications%rowtype;
  v_org uuid; v_admin uuid; v_email text;
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
  insert into customer_organizations(name,is_active,settlement_cycle,br_number,br_expires_on)
    values(v_app.company_name,true,p_settlement_cycle,v_app.br_number,v_app.br_expires_on)
    returning id into v_org;
  insert into customer_memberships(user_id,organization_id,role,is_active)
    values(v_admin,v_org,'admin',true)
  on conflict (user_id, organization_id) do update set role='admin', is_active=true;
  insert into customer_portal_active_organizations(user_id, organization_id)
    values(v_admin, v_org) on conflict (user_id) do nothing;
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
