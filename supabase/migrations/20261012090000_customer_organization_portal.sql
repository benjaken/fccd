-- Customer identities use Supabase Auth, never the contact-based lookup token.
alter table public.orders drop constraint if exists orders_source_system_check;
alter table public.orders add constraint orders_source_system_check check (
  source_system = any(array['bubble','shopify','emailmeform','enquiry_form','whatsapp','customer_portal']::text[])
);
create table public.customer_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  customer_id uuid references public.customers(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.customer_memberships (
  user_id uuid primary key references auth.users(id),
  organization_id uuid not null references public.customer_organizations(id),
  role text not null default 'member' check (role in ('admin', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.customer_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.customer_organizations(id),
  email text not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.customer_organizations(id),
  label text not null,
  recipient text not null,
  phone text not null,
  address text not null,
  created_by uuid not null references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
-- Each assignment has a delivery date and server-authoritative prices/fees.
create table public.customer_menu_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.customer_organizations(id),
  channel_id uuid not null references public.channels(id),
  name text not null,
  delivery_date date not null,
  delivery_time text not null,
  cutoff_at timestamptz not null,
  shipping_fee numeric(14,2) not null default 0 check (shipping_fee >= 0),
  is_active boolean not null default true
);
create table public.customer_menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.customer_menu_assignments(id),
  product_id uuid not null references public.products(id),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  available_quantity integer not null check (available_quantity >= 0),
  unique(menu_id, product_id)
);
create table public.customer_reward_rules (
  id uuid primary key default gen_random_uuid(),
  points_per_hkd numeric(12,4) not null check (points_per_hkd between 0 and 100000),
  effective_at timestamptz not null unique,
  created_at timestamptz not null default now()
);
insert into public.customer_reward_rules(points_per_hkd, effective_at) values (100, now());
create table public.customer_reward_accounts (
  organization_id uuid primary key references public.customer_organizations(id)
);
create table public.customer_reward_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.customer_organizations(id),
  points bigint not null,
  remaining_points bigint not null default 0 check (remaining_points >= 0),
  kind text not null check (kind in ('earn','redeem','return','expire','clawback')),
  order_id uuid references public.orders(id),
  actor_id uuid references auth.users(id),
  event_key text not null unique,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index customer_reward_entries_account_idx on public.customer_reward_entries(organization_id, expires_at);
create table public.customer_portal_orders (
  order_id uuid primary key references public.orders(id),
  organization_id uuid not null references public.customer_organizations(id),
  created_by uuid not null references auth.users(id),
  menu_id uuid not null references public.customer_menu_assignments(id),
  request_id uuid not null,
  reward_rule_id uuid not null references public.customer_reward_rules(id),
  food_amount numeric(14,2) not null,
  points_used bigint not null default 0,
  earned_at timestamptz,
  unique(organization_id, request_id)
);
create table public.customer_reward_redemptions (
  order_id uuid not null references public.orders(id),
  entry_id uuid not null references public.customer_reward_entries(id),
  points bigint not null check (points > 0),
  primary key(order_id,entry_id)
);
create table public.customer_cancel_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  organization_id uuid not null references public.customer_organizations(id),
  requested_by uuid not null references auth.users(id),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now()
);

create or replace function private.customer_organization(p_admin boolean default false)
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  select m.organization_id into v_id from public.customer_memberships m
  join public.customer_organizations o on o.id=m.organization_id and o.is_active
  join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
  where m.user_id=auth.uid() and m.is_active and (not p_admin or m.role='admin');
  if v_id is null then raise exception 'customer_membership_required' using errcode='42501'; end if;
  return v_id;
end $$;

-- No customer has direct table writes; every mutation validates membership.
do $$ declare t text; begin
  foreach t in array array['customer_organizations','customer_memberships','customer_invitations',
    'customer_addresses','customer_menu_assignments','customer_menu_items','customer_reward_rules',
    'customer_reward_accounts','customer_reward_entries','customer_reward_redemptions','customer_portal_orders','customer_cancel_requests'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
revoke all on function private.customer_organization(boolean) from public, anon, authenticated;

create or replace function private.customer_reward_balance(p_org uuid)
returns bigint language sql stable security definer set search_path=public,pg_temp as $$
  -- Expired positive lots cannot hide outstanding clawback debt.
  select coalesce(sum(points),0)::bigint - coalesce(sum(remaining_points)
    filter (where expires_at <= now()),0)::bigint
  from public.customer_reward_entries where organization_id=p_org
$$;
revoke all on function private.customer_reward_balance(uuid) from public, anon, authenticated;

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
      'user_id',m.user_id,'email',u.email,'role',m.role,'is_active',m.is_active))
      from customer_memberships m join auth.users u on u.id=m.user_id where m.organization_id=v_org),'[]') else '[]'::jsonb end,
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

create or replace function public.customer_portal_save_address(p_label text,p_recipient text,p_phone text,p_address text)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_id uuid;
begin
  if length(btrim(p_label)) not between 1 and 80 or length(btrim(p_recipient)) not between 1 and 100
    or length(btrim(p_address)) not between 5 and 500 or p_phone !~ '^\+?[0-9 -]{8,20}$'
    or p_label is null or p_recipient is null or p_address is null or p_phone is null then
    raise exception 'invalid_address';
  end if;
  insert into customer_addresses(organization_id,label,recipient,phone,address,created_by)
  values(v_org,btrim(p_label),btrim(p_recipient),p_phone,btrim(p_address),auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.customer_portal_invite(p_email text)
returns text language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare v_org uuid:=private.customer_organization(true); v_token text:=encode(gen_random_bytes(32),'hex');
begin
  if p_email is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email'; end if;
  insert into customer_invitations(organization_id,email,token_hash,expires_at,created_by)
  values(v_org,lower(btrim(p_email)),digest(v_token,'sha256'),now()+interval '7 days',auth.uid());
  return v_token;
end $$;
create or replace function public.customer_portal_accept_invite(p_token text)
returns void language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare v_inv customer_invitations%rowtype; v_email text;
begin
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'email_verification_required'; end if;
  select * into v_inv from customer_invitations where token_hash=digest(p_token,'sha256')
    and email=v_email and accepted_at is null and expires_at>now() for update;
  if v_inv.id is null or not exists(select 1 from customer_organizations where id=v_inv.organization_id and is_active) then raise exception 'invalid_invitation'; end if;
  insert into customer_memberships(user_id,organization_id) values(auth.uid(),v_inv.organization_id);
  update customer_invitations set accepted_at=now() where id=v_inv.id;
end $$;
create or replace function public.customer_portal_remove_member(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(true); v_member customer_memberships%rowtype;
begin
  perform 1 from customer_organizations where id=v_org for update;
  select * into v_member from customer_memberships where user_id=p_user_id and organization_id=v_org and is_active;
  if v_member.user_id is null then raise exception 'member_not_found'; end if;
  if v_member.role='admin' and not exists(select 1 from customer_memberships where organization_id=v_org and role='admin' and is_active and user_id<>p_user_id)
    then raise exception 'last_admin_required'; end if;
  update customer_memberships set is_active=false where user_id=p_user_id;
end $$;

create or replace function public.customer_portal_submit_order(p_request_id uuid,p_menu_id uuid,p_address_id uuid,p_items jsonb,p_points bigint default 0)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_menu customer_menu_assignments%rowtype;
  v_address customer_addresses%rowtype; v_id uuid; v_food numeric(14,2); v_rule uuid; v_left bigint; v_take bigint; v_lot record;
begin
  if p_request_id is null or p_points is null or p_points<0 or p_points%10<>0 then raise exception 'invalid_redemption'; end if;
  insert into customer_reward_accounts(organization_id) values(v_org) on conflict do nothing;
  perform 1 from customer_reward_accounts where organization_id=v_org for update;
  select order_id into v_id from customer_portal_orders where organization_id=v_org and request_id=p_request_id;
  if v_id is not null then return v_id; end if;
  select * into v_menu from customer_menu_assignments where id=p_menu_id and organization_id=v_org and is_active and cutoff_at>now() for update;
  if v_menu.id is null or not exists(select 1 from channels where id=v_menu.channel_id and is_active and archived_at is null) then raise exception 'menu_unavailable'; end if;
  select * into v_address from customer_addresses where id=p_address_id and organization_id=v_org and archived_at is null;
  if v_address.id is null then raise exception 'address_required'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'invalid_cart'; end if;
  if (select count(*)<>count(distinct product_id) from jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer)) then raise exception 'duplicate_product'; end if;
  perform i.id from customer_menu_items i join jsonb_to_recordset(p_items) x(product_id uuid,quantity integer) on x.product_id=i.product_id
    where i.menu_id=p_menu_id order by i.id for update of i;
  if exists(select 1 from jsonb_to_recordset(p_items) x(product_id uuid,quantity integer)
    left join customer_menu_items i on i.menu_id=p_menu_id and i.product_id=x.product_id
    left join products p on p.id=x.product_id
    where i.id is null or x.quantity is null or x.quantity<=0 or x.quantity>i.available_quantity
      or not p.is_active or p.archived_at is not null or p.channel_id is distinct from v_menu.channel_id) then raise exception 'cart_unavailable'; end if;
  select sum(i.unit_price*x.quantity) into v_food from customer_menu_items i
    join jsonb_to_recordset(p_items) x(product_id uuid,quantity integer) on x.product_id=i.product_id where i.menu_id=p_menu_id;
  if p_points>greatest(private.customer_reward_balance(v_org),0) or p_points/1000.0>v_food then raise exception 'insufficient_points'; end if;
  select id into v_rule from customer_reward_rules where effective_at<=now() order by effective_at desc limit 1;
  if v_rule is null then raise exception 'reward_rule_required'; end if;
  v_id:=gen_random_uuid();
  insert into orders(id,legacy_id,customer_id,channel_id,document_type,company_name_snapshot,customer_name_snapshot,
    email_snapshot,contact_number_a_snapshot,shipping_address_snapshot,delivery_at,delivery_time,shipping_fee,
    discount_amount,grand_total,outstanding,is_shopify_order,source_system)
  values(v_id,'web-order-'||v_id,(select customer_id from customer_organizations where id=v_org),v_menu.channel_id,'order',
    (select name from customer_organizations where id=v_org),v_address.recipient,(select email from auth.users where id=auth.uid()),
    v_address.phone,v_address.address,v_menu.delivery_date::timestamp at time zone 'Asia/Hong_Kong',v_menu.delivery_time,
    v_menu.shipping_fee,p_points/1000.0,v_food+v_menu.shipping_fee-p_points/1000.0,v_food+v_menu.shipping_fee-p_points/1000.0,false,'customer_portal');
  insert into order_lines(legacy_id,order_id,product_id,sku_snapshot,product_name_snapshot,quantity,unit_price,total_price,is_addon)
  select 'portal-line-'||gen_random_uuid(),v_id,p.id,p.sku,coalesce(nullif(p.chinese_name,''),p.name),x.quantity,i.unit_price,x.quantity*i.unit_price,false
    from customer_menu_items i join products p on p.id=i.product_id
    join jsonb_to_recordset(p_items) x(product_id uuid,quantity integer) on x.product_id=i.product_id where i.menu_id=p_menu_id;
  update customer_menu_items i set available_quantity=available_quantity-x.quantity
    from jsonb_to_recordset(p_items) x(product_id uuid,quantity integer) where i.menu_id=p_menu_id and i.product_id=x.product_id;
  insert into customer_portal_orders(order_id,organization_id,created_by,menu_id,request_id,reward_rule_id,food_amount,points_used)
    values(v_id,v_org,auth.uid(),p_menu_id,p_request_id,v_rule,v_food,p_points);
  v_left:=p_points;
  for v_lot in select id,remaining_points from customer_reward_entries where organization_id=v_org
    and remaining_points>0 and expires_at>now() order by expires_at,id for update loop
    exit when v_left=0; v_take:=least(v_left,v_lot.remaining_points);
    update customer_reward_entries set remaining_points=remaining_points-v_take where id=v_lot.id;
    insert into customer_reward_redemptions(order_id,entry_id,points) values(v_id,v_lot.id,v_take);
    v_left:=v_left-v_take;
  end loop;
  if v_left>0 then raise exception 'insufficient_points'; end if;
  if p_points>0 then insert into customer_reward_entries(organization_id,points,kind,order_id,actor_id,event_key)
    values(v_org,-p_points,'redeem',v_id,auth.uid(),'redeem:'||v_id); end if;
  return v_id;
end $$;

create or replace function public.customer_portal_request_cancel(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization();
begin
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'cancel_reason_required'; end if;
  if not exists(select 1 from customer_portal_orders po join orders o on o.id=po.order_id where po.organization_id=v_org
    and o.id=p_order_id and not coalesce(o.is_shopify_order,false) and o.archived_at is null
    and coalesce(o.delivery_status,'') not in ('已取消','己取消','取消','已送達','己送達','送貨途中')) then raise exception 'order_not_cancellable'; end if;
  insert into customer_cancel_requests(order_id,organization_id,requested_by,reason)
    values(p_order_id,v_org,auth.uid(),btrim(p_reason)) on conflict(order_id) do nothing;
end $$;

-- Only a trusted backend may post completion rewards; customer RPCs cannot.
create or replace function public.customer_portal_award_completed_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_po customer_portal_orders%rowtype; v_points bigint; v_local date; v_expiry timestamptz;
begin
  select * into v_po from customer_portal_orders where order_id=p_order_id;
  if v_po.order_id is null then return; end if;
  insert into customer_reward_accounts(organization_id) values(v_po.organization_id) on conflict do nothing;
  perform 1 from customer_reward_accounts where organization_id=v_po.organization_id for update;
  select * into v_po from customer_portal_orders where order_id=p_order_id for update;
  if v_po.earned_at is not null then return; end if;
  if not exists(select 1 from orders where id=p_order_id and delivery_status in ('已送達','己送達','已取','已取貨') and archived_at is null) then raise exception 'order_not_completed'; end if;
  select floor(greatest(v_po.food_amount-v_po.points_used/1000.0,0)*r.points_per_hkd)::bigint into v_points
    from customer_reward_rules r where r.id=v_po.reward_rule_id;
  v_local := (now() at time zone 'Asia/Hong_Kong')::date;
  v_expiry := ((v_local + interval '1 year')::date + time '23:59:59') at time zone 'Asia/Hong_Kong';
  insert into customer_reward_entries(organization_id,points,remaining_points,kind,order_id,event_key,expires_at)
    values(v_po.organization_id,v_points,v_points,'earn',p_order_id,'earn:'||p_order_id,v_expiry);
  update customer_portal_orders set earned_at=now() where order_id=p_order_id;
end $$;
revoke all on function public.customer_portal_award_completed_order(uuid) from public,anon,authenticated;
grant execute on function public.customer_portal_award_completed_order(uuid) to service_role;

create or replace function private.customer_portal_completion_trigger()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if new.delivery_status in ('已送達','己送達','已取','已取貨') and new.delivery_status is distinct from old.delivery_status then
    perform public.customer_portal_award_completed_order(new.id);
  end if;
  return new;
end $$;
revoke all on function private.customer_portal_completion_trigger() from public,anon,authenticated;
create trigger customer_portal_completion after update of delivery_status on public.orders
for each row execute function private.customer_portal_completion_trigger();

do $$ declare signature text; begin
  foreach signature in array array['customer_portal_snapshot()', 'customer_portal_save_address(text,text,text,text)',
    'customer_portal_invite(text)','customer_portal_accept_invite(text)','customer_portal_remove_member(uuid)',
    'customer_portal_submit_order(uuid,uuid,uuid,jsonb,bigint)','customer_portal_request_cancel(uuid,text)'] loop
    execute 'revoke all on function public.'||signature||' from public,anon';
    execute 'grant execute on function public.'||signature||' to authenticated';
  end loop;
end $$;
