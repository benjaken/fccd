-- Admin role handover and pending invitation revoke/list (TEAM01).
alter table public.customer_invitations
  add column if not exists revoked_at timestamptz;

create or replace function public.customer_portal_set_member_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(true); v_member customer_memberships%rowtype;
begin
  if p_user_id is null or p_role is distinct from 'admin' and p_role is distinct from 'member' then
    raise exception 'invalid_role';
  end if;
  perform 1 from customer_organizations where id=v_org for update;
  select * into v_member from customer_memberships
    where user_id=p_user_id and organization_id=v_org and is_active;
  if v_member.user_id is null then raise exception 'member_not_found'; end if;
  if v_member.role = p_role then return; end if;
  if v_member.role='admin' and p_role='member'
    and not exists(
      select 1 from customer_memberships
      where organization_id=v_org and role='admin' and is_active and user_id<>p_user_id
    ) then
    raise exception 'last_admin_required';
  end if;
  update customer_memberships set role=p_role where user_id=p_user_id and organization_id=v_org;
end $$;

create or replace function public.customer_portal_revoke_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(true);
begin
  if p_invitation_id is null then raise exception 'invalid_invitation'; end if;
  update customer_invitations set revoked_at=now()
    where id=p_invitation_id and organization_id=v_org
      and accepted_at is null and revoked_at is null;
  if not found then raise exception 'invalid_invitation'; end if;
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
  insert into customer_memberships(user_id,organization_id) values(auth.uid(),v_inv.organization_id);
  update customer_invitations set accepted_at=now() where id=v_inv.id;
end $$;

create or replace function public.customer_portal_snapshot()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_role text;
begin
  select role into v_role from customer_memberships where user_id=auth.uid();
  return jsonb_build_object(
    'organization', (select jsonb_build_object('id',id,'name',name) from customer_organizations where id=v_org),
    'role',v_role, 'balance',private.customer_reward_balance(v_org),
    'addresses',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from customer_addresses a where organization_id=v_org and archived_at is null),'[]'),
    'members', case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,'role',m.role,'is_active',m.is_active) order by m.created_at)
      from customer_memberships m join auth.users u on u.id=m.user_id where m.organization_id=v_org),'[]') else '[]'::jsonb end,
    'invitations', case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'expires_at',i.expires_at,'created_at',i.created_at) order by i.created_at desc)
      from customer_invitations i
      where i.organization_id=v_org and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()),'[]')
      else '[]'::jsonb end,
    'menus',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'name',m.name,'brand',c.name,'channel_id',m.channel_id,
      'delivery_date',m.delivery_date,'delivery_time',m.delivery_time,'cutoff_at',m.cutoff_at,'shipping_fee',m.shipping_fee,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product_id',p.id,'name',coalesce(nullif(p.chinese_name,''),p.name),
        'unit_price',i.unit_price,'available_quantity',i.available_quantity) order by p.name)
        from customer_menu_items i join products p on p.id=i.product_id
        where i.menu_id=m.id and p.channel_id=m.channel_id and p.is_active and p.archived_at is null),'[]')) order by m.delivery_date,m.name)
      from customer_menu_assignments m join channels c on c.id=m.channel_id and c.is_active and c.archived_at is null
      where m.organization_id=v_org and m.is_active and m.cutoff_at>now()),'[]'),
    'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'number',o.order_number,'delivery_at',o.delivery_at,
      'status',o.delivery_status,'total',o.grand_total,'outstanding',o.outstanding,'brand',c.name,
      'points_used',po.points_used,'cancel_status',cr.status,
      'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',l.product_id,'name',l.product_name_snapshot,
        'quantity',l.quantity,'unit_price',l.unit_price)) from order_lines l where l.order_id=o.id and not l.is_void),'[]')) order by o.created_at desc)
      from customer_portal_orders po join orders o on o.id=po.order_id join channels c on c.id=o.channel_id
      left join customer_cancel_requests cr on cr.order_id=o.id
      where po.organization_id=v_org and o.archived_at is null),'[]'),
    'ledger',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from
      (select id,points,kind,order_id,actor_id,expires_at,created_at from customer_reward_entries
        where organization_id=v_org order by created_at desc limit 100) e),'[]')
  );
end $$;

do $$ declare signature text; begin
  foreach signature in array array[
    'customer_portal_set_member_role(uuid,text)',
    'customer_portal_revoke_invitation(uuid)'
  ] loop
    execute 'revoke all on function public.'||signature||' from public,anon';
    execute 'grant execute on function public.'||signature||' to authenticated';
  end loop;
end $$;
