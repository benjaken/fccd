-- Members submit internal requests that only reach FCC after the company admin
-- reviews them and sends a batch. Nothing is created on the FCC side until a
-- send, so the FCC queue never shows an unreviewed member submission. The member
-- submission and the admin send share the menu's single cutoff time.
create table public.customer_member_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.customer_organizations(id),
  member_id uuid not null references auth.users(id),
  created_by uuid not null references auth.users(id),
  menu_id uuid not null references public.customer_menu_assignments(id),
  service_date date not null,
  address_id uuid references public.customer_addresses(id),
  food_amount numeric(14,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'submitted' check (status in ('submitted','sent')),
  request_id uuid not null,
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references auth.users(id),
  unique (organization_id, member_id, request_id)
);
create table public.customer_member_request_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.customer_organizations(id),
  request_id uuid references public.customer_member_requests(id) on delete set null,
  actor_id uuid not null,
  action text not null check (action in ('create','update','delete','send')),
  detail jsonb,
  created_at timestamptz not null default now()
);
create table public.customer_member_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.customer_organizations(id),
  menu_id uuid not null references public.customer_menu_assignments(id),
  service_date date not null,
  idempotency_key uuid not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
alter table public.customer_member_requests enable row level security;
alter table public.customer_member_request_events enable row level security;
alter table public.customer_member_batches enable row level security;
revoke all on public.customer_member_requests, public.customer_member_request_events, public.customer_member_batches from public, anon, authenticated;
grant all on public.customer_member_requests, public.customer_member_request_events, public.customer_member_batches to service_role;

create or replace function private.customer_member_request_items_valid(p_menu_id uuid, p_items jsonb)
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $$
  select jsonb_typeof(p_items)='array' and jsonb_array_length(p_items) between 1 and 50
    and (select count(*)=count(distinct product_id) from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer))
    and not exists(
      select 1 from jsonb_to_recordset(p_items) x(product_id uuid, quantity integer)
      left join customer_menu_items i on i.menu_id=p_menu_id and i.product_id=x.product_id
      left join products p on p.id=x.product_id
      where i.id is null or x.quantity is null or x.quantity<=0 or x.quantity>i.available_quantity
        or not p.is_active or p.archived_at is not null)
$$;
revoke all on function private.customer_member_request_items_valid(uuid,jsonb) from public,anon,authenticated;

create or replace function private.customer_member_request_amount(p_menu_id uuid, p_items jsonb)
returns numeric language sql stable security definer set search_path=public,private,pg_temp as $$
  select coalesce(sum(i.unit_price*x.quantity),0) from customer_menu_items i
    join jsonb_to_recordset(p_items) x(product_id uuid, quantity integer) on x.product_id=i.product_id
    where i.menu_id=p_menu_id
$$;
revoke all on function private.customer_member_request_amount(uuid,jsonb) from public,anon,authenticated;

-- A member (or, for order-on-behalf, an admin) submits an internal request.
create or replace function public.customer_portal_submit_member_request(
  p_request_id uuid, p_menu_id uuid, p_service_date date, p_address_id uuid, p_items jsonb, p_member_id uuid default null
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_member uuid; v_role text;
  v_menu customer_menu_assignments%rowtype; v_today date:=(timezone('Asia/Hong_Kong',now()))::date;
  v_day date; v_id uuid;
begin
  perform private.customer_require_permission('ordering');
  if p_request_id is null then raise exception 'invalid_cart'; end if;
  select role into v_role from customer_memberships where user_id=auth.uid() and organization_id=v_org and is_active;
  v_member := coalesce(p_member_id, auth.uid());
  if v_member <> auth.uid() and v_role is distinct from 'admin' then raise exception 'permission_denied'; end if;
  if not exists(select 1 from customer_memberships where user_id=v_member and organization_id=v_org and is_active) then
    raise exception 'member_not_found';
  end if;
  select id into v_id from customer_member_requests where organization_id=v_org and member_id=v_member and request_id=p_request_id;
  if v_id is not null then return v_id; end if;
  if not exists(select 1 from customer_memberships where user_id=v_member and organization_id=v_org and is_active and (role='admin' or can_order)) then
    raise exception 'ordering_disabled';
  end if;
  select * into v_menu from customer_menu_assignments where id=p_menu_id and organization_id=v_org and is_active and cutoff_at>now();
  if v_menu.id is null or v_menu.valid_until < v_today then raise exception 'menu_unavailable'; end if;
  v_day := coalesce(p_service_date, v_menu.delivery_date);
  if v_day < v_menu.delivery_date or v_day > v_menu.valid_until or v_day < v_today then raise exception 'delivery_date_unavailable'; end if;
  if p_address_id is null or not exists(select 1 from customer_addresses where id=p_address_id and organization_id=v_org and archived_at is null) then
    raise exception 'address_required';
  end if;
  if not private.customer_member_request_items_valid(p_menu_id, p_items) then raise exception 'cart_unavailable'; end if;
  insert into customer_member_requests(organization_id,member_id,created_by,menu_id,service_date,address_id,food_amount,items,request_id)
    values(v_org,v_member,auth.uid(),p_menu_id,v_day,p_address_id,
      private.customer_member_request_amount(p_menu_id, p_items), p_items, p_request_id) returning id into v_id;
  insert into customer_member_request_events(organization_id,request_id,actor_id,action,detail)
    values(v_org,v_id,auth.uid(),'create',jsonb_build_object('member_id',v_member,'menu_id',p_menu_id,'service_date',v_day));
  return v_id;
end $$;

create or replace function public.customer_portal_update_member_request(
  p_id uuid, p_items jsonb, p_service_date date, p_address_id uuid
) returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_req customer_member_requests%rowtype; v_menu customer_menu_assignments%rowtype;
  v_day date;
begin
  perform private.customer_require_permission('ordering');
  if not private.customer_is_admin() then raise exception 'permission_denied'; end if;
  select * into v_req from customer_member_requests where id=p_id and organization_id=v_org and status='submitted' for update;
  if v_req.id is null then raise exception 'request_not_found'; end if;
  select * into v_menu from customer_menu_assignments where id=v_req.menu_id;
  v_day := coalesce(p_service_date, v_req.service_date);
  if v_day < v_menu.delivery_date or v_day > v_menu.valid_until then raise exception 'delivery_date_unavailable'; end if;
  if p_address_id is not null and not exists(select 1 from customer_addresses where id=p_address_id and organization_id=v_org and archived_at is null) then
    raise exception 'address_required';
  end if;
  if not private.customer_member_request_items_valid(v_req.menu_id, p_items) then raise exception 'cart_unavailable'; end if;
  update customer_member_requests
    set items=p_items, service_date=v_day, address_id=coalesce(p_address_id,address_id),
        food_amount=private.customer_member_request_amount(v_req.menu_id, p_items), updated_at=now()
    where id=p_id;
  insert into customer_member_request_events(organization_id,request_id,actor_id,action,detail)
    values(v_org,p_id,auth.uid(),'update',jsonb_build_object('items',p_items,'service_date',v_day));
end $$;

create or replace function public.customer_portal_delete_member_request(p_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_req customer_member_requests%rowtype;
begin
  perform private.customer_require_permission('ordering');
  if not private.customer_is_admin() then raise exception 'permission_denied'; end if;
  select * into v_req from customer_member_requests where id=p_id and organization_id=v_org and status='submitted' for update;
  if v_req.id is null then raise exception 'request_not_found'; end if;
  delete from customer_member_requests where id=p_id;
  insert into customer_member_request_events(organization_id,request_id,actor_id,action,detail)
    values(v_org,null,auth.uid(),'delete',jsonb_build_object('deleted_request_id',p_id));
end $$;

-- Sends every submitted request for a menu/service date to FCC, one quote per
-- member so each member keeps seeing only their own order. Idempotent by key.
create or replace function public.customer_portal_send_member_requests(
  p_menu_id uuid, p_service_date date, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_batch uuid; v_ids jsonb:='[]'::jsonb;
  v_req record; v_menu customer_menu_assignments%rowtype; v_address customer_addresses%rowtype;
  v_order uuid; v_rule uuid; v_email text;
begin
  perform private.customer_require_permission('ordering');
  if not private.customer_is_admin() then raise exception 'permission_denied'; end if;
  if p_menu_id is null or p_service_date is null or p_idempotency_key is null then raise exception 'invalid_batch'; end if;
  select id into v_batch from customer_member_batches where organization_id=v_org and idempotency_key=p_idempotency_key;
  if v_batch is not null then
    return coalesce((select jsonb_agg(order_id) from customer_member_requests
      where organization_id=v_org and menu_id=p_menu_id and service_date=p_service_date and status='sent' and order_id is not null),'[]'::jsonb);
  end if;
  select * into v_menu from customer_menu_assignments where id=p_menu_id and organization_id=v_org;
  if v_menu.id is null or v_menu.cutoff_at<=now() then raise exception 'menu_unavailable'; end if;
  select id into v_rule from customer_reward_rules where effective_at<=now() order by effective_at desc limit 1;
  if v_rule is null then raise exception 'reward_rule_required'; end if;
  if not exists(select 1 from customer_member_requests where organization_id=v_org and menu_id=p_menu_id and service_date=p_service_date and status='submitted') then
    raise exception 'no_requests';
  end if;
  insert into customer_member_batches(organization_id,menu_id,service_date,idempotency_key,created_by)
    values(v_org,p_menu_id,p_service_date,p_idempotency_key,auth.uid()) returning id into v_batch;
  insert into customer_reward_accounts(organization_id) values(v_org) on conflict do nothing;
  for v_req in select * from customer_member_requests
      where organization_id=v_org and menu_id=p_menu_id and service_date=p_service_date and status='submitted'
      order by created_at for update loop
    perform i.id from customer_menu_items i
      join jsonb_to_recordset(v_req.items) x(product_id uuid, quantity integer) on x.product_id=i.product_id
      where i.menu_id=p_menu_id order by i.id for update of i;
    if exists(select 1 from jsonb_to_recordset(v_req.items) x(product_id uuid, quantity integer)
      left join customer_menu_items i on i.menu_id=p_menu_id and i.product_id=x.product_id
      where i.id is null or x.quantity>i.available_quantity) then raise exception 'cart_unavailable'; end if;
    select * into v_address from customer_addresses where id=v_req.address_id;
    select email into v_email from auth.users where id=v_req.member_id;
    v_order:=gen_random_uuid();
    insert into orders(id,legacy_id,customer_id,channel_id,document_type,company_name_snapshot,customer_name_snapshot,
      email_snapshot,contact_number_a_snapshot,shipping_address_snapshot,delivery_at,delivery_time,shipping_fee,discount_amount,
      grand_total,outstanding,is_shopify_order,source_system)
    values(v_order,'web-quote-'||v_order,(select customer_id from customer_organizations where id=v_org),v_menu.channel_id,'quote',
      (select name from customer_organizations where id=v_org),v_address.recipient,v_email,v_address.phone,v_address.address,
      v_req.service_date::timestamp at time zone 'Asia/Hong_Kong',v_menu.delivery_time,v_menu.shipping_fee,0,
      v_req.food_amount+v_menu.shipping_fee,v_req.food_amount+v_menu.shipping_fee,false,'customer_portal');
    insert into order_lines(legacy_id,order_id,product_id,sku_snapshot,product_name_snapshot,quantity,unit_price,total_price,is_addon)
    select 'portal-line-'||gen_random_uuid(),v_order,p.id,p.sku,coalesce(nullif(p.chinese_name,''),p.name),x.quantity,i.unit_price,x.quantity*i.unit_price,false
      from customer_menu_items i join products p on p.id=i.product_id
      join jsonb_to_recordset(v_req.items) x(product_id uuid, quantity integer) on x.product_id=i.product_id
      where i.menu_id=p_menu_id;
    update customer_menu_items i set available_quantity=available_quantity-x.quantity
      from jsonb_to_recordset(v_req.items) x(product_id uuid, quantity integer)
      where i.menu_id=p_menu_id and i.product_id=x.product_id;
    insert into customer_portal_orders(order_id,organization_id,created_by,menu_id,request_id,reward_rule_id,food_amount,points_used)
      values(v_order,v_org,v_req.member_id,p_menu_id,v_req.request_id,v_rule,v_req.food_amount,0);
    update customer_member_requests set status='sent', order_id=v_order, sent_at=now(), sent_by=auth.uid(), updated_at=now() where id=v_req.id;
    insert into customer_member_request_events(organization_id,request_id,actor_id,action,detail)
      values(v_org,v_req.id,auth.uid(),'send',jsonb_build_object('order_id',v_order));
    v_ids := v_ids || to_jsonb(v_order);
  end loop;
  return v_ids;
end $$;

-- Admins see the whole company's pending submissions; a member sees only their
-- own. Amounts follow the company price-visibility setting.
create or replace function public.customer_portal_member_requests(p_menu_id uuid default null, p_service_date date default null)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_role text; v_show boolean:=private.customer_prices_visible();
begin
  select role into v_role from customer_memberships where user_id=auth.uid() and organization_id=v_org and is_active;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'member_id',r.member_id,'created_by',r.created_by,'menu_id',r.menu_id,'service_date',r.service_date,
    'address_id',r.address_id,'food_amount',case when v_show then r.food_amount else null end,'status',r.status,
    'order_id',r.order_id,'created_at',r.created_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object('product_id',x.product_id,'quantity',x.quantity,
      'name',coalesce(nullif(p.chinese_name,''),p.name)))
      from jsonb_to_recordset(r.items) x(product_id uuid, quantity integer)
      left join products p on p.id=x.product_id),'[]')) order by r.created_at)
    from customer_member_requests r
    where r.organization_id=v_org and r.status='submitted'
      and (v_role='admin' or r.member_id=auth.uid())
      and (p_menu_id is null or r.menu_id=p_menu_id)
      and (p_service_date is null or r.service_date=p_service_date)),'[]'::jsonb);
end $$;

revoke all on function public.customer_portal_member_requests(uuid,date) from public,anon;
grant execute on function public.customer_portal_member_requests(uuid,date) to authenticated;
revoke all on function public.customer_portal_submit_member_request(uuid,uuid,date,uuid,jsonb,uuid) from public,anon;
revoke all on function public.customer_portal_update_member_request(uuid,jsonb,date,uuid) from public,anon;
revoke all on function public.customer_portal_delete_member_request(uuid) from public,anon;
revoke all on function public.customer_portal_send_member_requests(uuid,date,uuid) from public,anon;
grant execute on function public.customer_portal_submit_member_request(uuid,uuid,date,uuid,jsonb,uuid) to authenticated;
grant execute on function public.customer_portal_update_member_request(uuid,jsonb,date,uuid) to authenticated;
grant execute on function public.customer_portal_delete_member_request(uuid) to authenticated;
grant execute on function public.customer_portal_send_member_requests(uuid,date,uuid) to authenticated;
