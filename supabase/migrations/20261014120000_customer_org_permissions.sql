-- Company admins choose which of the nine portal permissions members have.
-- Admin always keeps all nine. This does not change FCCD platform role permissions.

create table public.customer_org_member_permissions (
  organization_id uuid not null references public.customer_organizations(id),
  permission text not null check (permission in ('members','ordering','orders','export','menus','delivery','points','redeem','settings')),
  allowed boolean not null,
  primary key (organization_id, permission)
);
alter table public.customer_org_member_permissions enable row level security;
revoke all on table public.customer_org_member_permissions from public, anon, authenticated;
grant all on table public.customer_org_member_permissions to service_role;

create or replace function private.customer_permission_default(p_role text, p_key text)
returns boolean language sql immutable as $$
  select p_role = 'admin' or p_key in ('ordering','orders','delivery','points','redeem')
$$;

create or replace function private.customer_permission_known(p_key text)
returns boolean language sql immutable as $$
  select p_key in ('members','ordering','orders','export','menus','delivery','points','redeem','settings')
$$;

create or replace function private.customer_has_permission(p_key text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_role text; v_allowed boolean;
begin
  if not private.customer_permission_known(p_key) then return false; end if;
  select role into v_role from customer_memberships
    where user_id = auth.uid() and organization_id = v_org and is_active;
  if v_role = 'admin' then return true; end if;
  select allowed into v_allowed from customer_org_member_permissions
    where organization_id = v_org and permission = p_key;
  return coalesce(v_allowed, private.customer_permission_default('member', p_key));
end $$;

create or replace function private.customer_require_permission(p_key text)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if not private.customer_has_permission(p_key) then raise exception 'permission_denied'; end if;
end $$;

create or replace function private.customer_member_permission_catalog(p_org uuid)
returns jsonb language sql stable security definer set search_path=public,private,pg_temp as $$
  select coalesce(jsonb_object_agg(k.key, coalesce(p.allowed, private.customer_permission_default('member', k.key))), '{}'::jsonb)
  from (values ('members'),('ordering'),('orders'),('export'),('menus'),('delivery'),('points'),('redeem'),('settings')) as k(key)
  left join customer_org_member_permissions p on p.organization_id = p_org and p.permission = k.key
$$;

create or replace function public.customer_portal_set_member_permission(p_permission text, p_allowed boolean)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(true);
begin
  if p_allowed is null or not private.customer_permission_known(p_permission) then
    raise exception 'invalid_permission';
  end if;
  insert into customer_org_member_permissions(organization_id, permission, allowed)
    values (v_org, p_permission, p_allowed)
  on conflict (organization_id, permission) do update set allowed = excluded.allowed;
  return private.customer_member_permission_catalog(v_org);
end $$;

create or replace function public.customer_portal_workspace()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_snap jsonb := public.customer_portal_snapshot();
begin
  if not private.customer_has_permission('orders') then
    v_snap := v_snap || jsonb_build_object('orders', '[]'::jsonb);
  end if;
  if not private.customer_has_permission('points') then
    v_snap := v_snap || jsonb_build_object('balance', 0, 'ledger', '[]'::jsonb);
  end if;
  if not private.customer_has_permission('ordering') then
    v_snap := v_snap || jsonb_build_object('menus', '[]'::jsonb, 'templates', '[]'::jsonb);
  end if;
  if not private.customer_has_permission('delivery') then
    v_snap := v_snap || jsonb_build_object('addresses', '[]'::jsonb);
  end if;
  return v_snap || jsonb_build_object(
    'permissions', private.customer_member_permission_catalog(v_org) ||
      case when (v_snap->>'role') = 'admin' then jsonb_build_object(
        'members', true, 'ordering', true, 'orders', true, 'export', true, 'menus', true, 'delivery', true, 'points', true, 'redeem', true, 'settings', true
      ) else '{}'::jsonb end,
    'memberPermissions', case when (v_snap->>'role') = 'admin' then private.customer_member_permission_catalog(v_org) else null end
  );
end $$;

create or replace function private.customer_portal_orders_require_ordering()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if auth.uid() is not null then perform private.customer_require_permission('ordering'); end if;
  return new;
end $$;
drop trigger if exists customer_portal_orders_ordering on public.customer_portal_orders;
create trigger customer_portal_orders_ordering
  before insert on public.customer_portal_orders
  for each row execute function private.customer_portal_orders_require_ordering();

create or replace function public.customer_portal_invite(p_email text)
returns text language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_token text := encode(gen_random_bytes(32), 'hex');
begin
  perform private.customer_require_permission('members');
  if p_email is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email'; end if;
  insert into customer_invitations(organization_id, email, token_hash, expires_at, created_by)
  values (v_org, lower(btrim(p_email)), digest(v_token, 'sha256'), now() + interval '7 days', auth.uid());
  return v_token;
end $$;

create or replace function public.customer_portal_remove_member(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_member customer_memberships%rowtype; v_actor text;
begin
  perform private.customer_require_permission('members');
  perform 1 from customer_organizations where id = v_org for update;
  select role into v_actor from customer_memberships where user_id = auth.uid() and organization_id = v_org and is_active;
  select * into v_member from customer_memberships where user_id = p_user_id and organization_id = v_org and is_active;
  if v_member.user_id is null then raise exception 'member_not_found'; end if;
  if v_member.role = 'admin' and v_actor is distinct from 'admin' then raise exception 'permission_denied'; end if;
  if v_member.role = 'admin' and not exists(
    select 1 from customer_memberships where organization_id = v_org and role = 'admin' and is_active and user_id <> p_user_id
  ) then raise exception 'last_admin_required'; end if;
  update customer_memberships set is_active = false where user_id = p_user_id and organization_id = v_org;
end $$;

create or replace function public.customer_portal_revoke_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
begin
  perform private.customer_require_permission('members');
  if p_invitation_id is null then raise exception 'invalid_invitation'; end if;
  update customer_invitations set revoked_at = now()
    where id = p_invitation_id and organization_id = v_org and accepted_at is null and revoked_at is null;
  if not found then raise exception 'invalid_invitation'; end if;
end $$;

create or replace function public.customer_portal_set_member_menu_scopes(p_user_id uuid, p_menu_ids uuid[])
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_actor text;
begin
  perform private.customer_require_permission('menus');
  select role into v_actor from customer_memberships where user_id = auth.uid() and organization_id = v_org and is_active;
  if p_user_id is null or not exists(
    select 1 from customer_memberships where user_id = p_user_id and organization_id = v_org and is_active
  ) then raise exception 'member_not_found'; end if;
  if v_actor is distinct from 'admin' and exists(
    select 1 from customer_memberships where user_id = p_user_id and organization_id = v_org and role = 'admin'
  ) then raise exception 'permission_denied'; end if;
  if p_menu_ids is not null and exists(
    select 1 from unnest(p_menu_ids) mid(menu_id)
    left join customer_menu_assignments a on a.id = mid.menu_id and a.organization_id = v_org and a.is_active
    where a.id is null
  ) then raise exception 'menu_unavailable'; end if;
  delete from customer_member_menu_scopes where organization_id = v_org and user_id = p_user_id;
  if p_menu_ids is not null and cardinality(p_menu_ids) > 0 then
    insert into customer_member_menu_scopes(organization_id, user_id, menu_id)
      select distinct v_org, p_user_id, mid.menu_id from unnest(p_menu_ids) mid(menu_id);
  end if;
end $$;

create or replace function public.customer_portal_save_address(p_label text, p_recipient text, p_phone text, p_address text)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_id uuid;
begin
  perform private.customer_require_permission('delivery');
  if length(btrim(p_label)) not between 1 and 80 or length(btrim(p_recipient)) not between 1 and 100
    or length(btrim(p_address)) not between 5 and 500 or p_phone !~ '^\+?[0-9 -]{8,20}$'
    or p_label is null or p_recipient is null or p_address is null or p_phone is null then
    raise exception 'invalid_address';
  end if;
  insert into customer_addresses(organization_id, label, recipient, phone, address, created_by)
  values (v_org, btrim(p_label), btrim(p_recipient), p_phone, btrim(p_address), auth.uid()) returning id into v_id;
  perform private.enqueue_customer_address_sync('organization', v_org, v_id, 'upsert');
  return v_id;
end $$;

create or replace function public.customer_portal_update_address(
  p_id uuid, p_label text, p_recipient text, p_phone text, p_address text
) returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
begin
  perform private.customer_require_permission('delivery');
  if p_id is null or length(btrim(p_label)) not between 1 and 80 or length(btrim(p_recipient)) not between 1 and 100
    or length(btrim(p_address)) not between 5 and 500 or p_phone !~ '^\+?[0-9 -]{8,20}$'
    or p_label is null or p_recipient is null or p_address is null or p_phone is null then
    raise exception 'invalid_address';
  end if;
  update customer_addresses
    set label = btrim(p_label), recipient = btrim(p_recipient), phone = p_phone, address = btrim(p_address)
    where id = p_id and organization_id = v_org and archived_at is null;
  if not found then raise exception 'address_required'; end if;
  perform private.enqueue_customer_address_sync('organization', v_org, p_id, 'upsert');
end $$;

create or replace function public.customer_portal_archive_address(p_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
begin
  perform private.customer_require_permission('delivery');
  if p_id is null then raise exception 'address_required'; end if;
  update customer_addresses set archived_at = now()
    where id = p_id and organization_id = v_org and archived_at is null;
  if not found then raise exception 'address_required'; end if;
  perform private.enqueue_customer_address_sync('organization', v_org, p_id, 'delete');
end $$;

create or replace function public.customer_portal_redeem_catalog(p_request_id uuid, p_catalog_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_item customer_reward_catalog%rowtype;
  v_existing uuid; v_left bigint; v_lot record; v_id uuid;
begin
  if p_request_id is null then raise exception 'invalid_request' using errcode='P0001'; end if;
  select id into v_existing from customer_reward_catalog_redemptions where organization_id=v_org and request_id=p_request_id;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'balance', private.customer_reward_balance(v_org));
  end if;
  perform private.customer_require_permission('redeem');
  insert into customer_reward_accounts(organization_id) values(v_org) on conflict do nothing;
  perform 1 from customer_reward_accounts where organization_id=v_org for update;
  select * into v_item from customer_reward_catalog where id=p_catalog_id for update;
  if v_item.id is null or not v_item.is_active or v_item.stock < 1 then raise exception 'catalog_unavailable' using errcode='P0001'; end if;
  if private.customer_reward_balance(v_org) < v_item.points_cost then raise exception 'insufficient_points' using errcode='P0001'; end if;
  v_left := v_item.points_cost;
  for v_lot in select id, remaining_points from customer_reward_entries
    where organization_id=v_org and remaining_points>0 and (expires_at is null or expires_at>now()) and (available_at is null or available_at<=now())
    order by expires_at nulls last, id for update loop
    exit when v_left=0;
    update customer_reward_entries set remaining_points=remaining_points-least(v_left, v_lot.remaining_points) where id=v_lot.id;
    v_left := v_left - least(v_left, v_lot.remaining_points);
  end loop;
  if v_left <> 0 then raise exception 'insufficient_points' using errcode='P0001'; end if;
  update customer_reward_catalog set stock=stock-1 where id=v_item.id;
  v_id := gen_random_uuid();
  insert into customer_reward_catalog_redemptions(id, catalog_id, organization_id, points, request_id)
    values(v_id, v_item.id, v_org, v_item.points_cost, p_request_id);
  insert into customer_reward_entries(organization_id, points, remaining_points, kind, order_id, actor_id, event_key)
    values(v_org, -v_item.points_cost, 0, 'redeem', null, auth.uid(), 'catalog:'||v_id);
  return jsonb_build_object('id', v_id, 'balance', private.customer_reward_balance(v_org));
end $$;

revoke all on function public.customer_portal_snapshot() from authenticated;
revoke all on function public.customer_portal_set_member_permission(text, boolean) from public, anon;
grant execute on function public.customer_portal_set_member_permission(text, boolean) to authenticated;
revoke all on function public.customer_portal_workspace() from public, anon;
grant execute on function public.customer_portal_workspace() to authenticated;
