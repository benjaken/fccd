-- One assigned menu covers a service period. Customers choose a day inside it.
alter table public.customer_menu_assignments
  add column if not exists valid_until date;

update public.customer_menu_assignments
  set valid_until = delivery_date
  where valid_until is null;

alter table public.customer_menu_assignments
  alter column valid_until set not null;

alter table public.customer_menu_assignments
  drop constraint if exists customer_menu_assignments_period_check;

alter table public.customer_menu_assignments
  add constraint customer_menu_assignments_period_check
  check (valid_until >= delivery_date);

create or replace function private.customer_menu_assignment_period()
returns trigger language plpgsql as $$
begin
  if new.valid_until is null then
    new.valid_until := new.delivery_date;
  end if;
  return new;
end $$;
revoke all on function private.customer_menu_assignment_period() from public, anon, authenticated;
drop trigger if exists customer_menu_assignment_period on public.customer_menu_assignments;
create trigger customer_menu_assignment_period
before insert or update of delivery_date, valid_until on public.customer_menu_assignments
for each row execute function private.customer_menu_assignment_period();

create or replace function public.customer_portal_ops_get_org(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org customer_organizations%rowtype;
begin
  perform private.customer_portal_ops_require(false);
  if p_org_id is null then raise exception 'organization_required'; end if;
  select * into v_org from customer_organizations where id=p_org_id;
  if v_org.id is null then raise exception 'organization_required'; end if;
  return jsonb_build_object(
    'id',v_org.id,'name',v_org.name,'customer_id',v_org.customer_id,'is_active',v_org.is_active,'created_at',v_org.created_at,
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,'role',m.role,'is_active',m.is_active,'created_at',m.created_at
    ) order by m.created_at) from customer_memberships m join auth.users u on u.id=m.user_id
      where m.organization_id=v_org.id),'[]'),
    'menus',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.name,'channel_id',a.channel_id,'brand',c.name,
      'delivery_date',a.delivery_date,'valid_until',a.valid_until,'delivery_time',a.delivery_time,'cutoff_at',a.cutoff_at,
      'shipping_fee',a.shipping_fee,'is_active',a.is_active,
      'item_count',(select count(*)::int from customer_menu_items i where i.menu_id=a.id)
    ) order by a.delivery_date desc, a.name)
      from customer_menu_assignments a
      join channels c on c.id=a.channel_id
      where a.organization_id=v_org.id),'[]')
  );
end $$;

create or replace function public.customer_portal_ops_get_menu(p_menu_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_menu customer_menu_assignments%rowtype;
begin
  perform private.customer_portal_ops_require(false);
  if p_menu_id is null then raise exception 'menu_required'; end if;
  select * into v_menu from customer_menu_assignments where id=p_menu_id;
  if v_menu.id is null then raise exception 'menu_required'; end if;
  return jsonb_build_object(
    'id',v_menu.id,'organization_id',v_menu.organization_id,'name',v_menu.name,
    'channel_id',v_menu.channel_id,'brand',(select name from channels where id=v_menu.channel_id),
    'delivery_date',v_menu.delivery_date,'valid_until',v_menu.valid_until,'delivery_time',v_menu.delivery_time,
    'cutoff_at',v_menu.cutoff_at,'shipping_fee',v_menu.shipping_fee,'is_active',v_menu.is_active,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'product_id',i.product_id,'name',coalesce(nullif(p.chinese_name,''),p.name),
      'sku',p.sku,'unit_price',i.unit_price,'available_quantity',i.available_quantity
    ) order by coalesce(nullif(p.chinese_name,''),p.name))
      from customer_menu_items i join products p on p.id=i.product_id where i.menu_id=v_menu.id),'[]')
  );
end $$;

drop function if exists public.customer_portal_ops_upsert_menu(uuid,uuid,uuid,text,date,text,timestamptz,numeric,boolean);
create or replace function public.customer_portal_ops_upsert_menu(
  p_id uuid, p_org_id uuid, p_channel_id uuid, p_name text,
  p_delivery_date date, p_valid_until date, p_delivery_time text, p_cutoff_at timestamptz,
  p_shipping_fee numeric, p_is_active boolean
)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid;
begin
  perform private.customer_portal_ops_require(true);
  if p_org_id is null or not exists(select 1 from customer_organizations where id=p_org_id) then
    raise exception 'organization_required';
  end if;
  if p_channel_id is null or not exists(select 1 from channels where id=p_channel_id and is_active and archived_at is null) then
    raise exception 'channel_required';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then raise exception 'invalid_menu'; end if;
  if p_delivery_date is null or p_valid_until is null or p_valid_until < p_delivery_date
    or p_delivery_time is null or length(btrim(p_delivery_time)) not between 1 and 40
    or p_cutoff_at is null or p_shipping_fee is null or p_shipping_fee < 0 then
    raise exception 'invalid_menu';
  end if;
  if p_id is null then
    insert into customer_menu_assignments(
      organization_id,channel_id,name,delivery_date,valid_until,delivery_time,cutoff_at,shipping_fee,is_active
    ) values(
      p_org_id,p_channel_id,btrim(p_name),p_delivery_date,p_valid_until,btrim(p_delivery_time),p_cutoff_at,
      p_shipping_fee,coalesce(p_is_active,true)
    ) returning id into v_id;
    return v_id;
  end if;
  update customer_menu_assignments set
    channel_id=p_channel_id, name=btrim(p_name), delivery_date=p_delivery_date, valid_until=p_valid_until,
    delivery_time=btrim(p_delivery_time), cutoff_at=p_cutoff_at, shipping_fee=p_shipping_fee,
    is_active=coalesce(p_is_active,is_active)
  where id=p_id and organization_id=p_org_id returning id into v_id;
  if v_id is null then raise exception 'menu_required'; end if;
  return v_id;
end $$;
revoke all on function public.customer_portal_ops_upsert_menu(uuid,uuid,uuid,text,date,date,text,timestamptz,numeric,boolean) from public, anon;
grant execute on function public.customer_portal_ops_upsert_menu(uuid,uuid,uuid,text,date,date,text,timestamptz,numeric,boolean) to authenticated;

-- ordering
drop function if exists public.customer_portal_submit_order(uuid,uuid,uuid,jsonb,bigint);
create or replace function public.customer_portal_submit_order(
  p_request_id uuid, p_menu_id uuid, p_address_id uuid, p_items jsonb, p_points bigint default 0, p_service_date date default null
)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_menu customer_menu_assignments%rowtype;
  v_address customer_addresses%rowtype; v_id uuid; v_food numeric(14,2); v_rule uuid;
  v_role text; v_day date; v_today date:=(timezone('Asia/Hong_Kong', now()))::date;
begin
  if p_request_id is null or p_points is null or p_points <> 0 then raise exception 'points_not_redeemable'; end if;
  insert into customer_reward_accounts(organization_id) values(v_org) on conflict do nothing;
  perform 1 from customer_reward_accounts where organization_id=v_org for update;
  select order_id into v_id from customer_portal_orders where organization_id=v_org and request_id=p_request_id;
  if v_id is not null then return v_id; end if;
  select role into v_role from customer_memberships where user_id=auth.uid() and organization_id=v_org and is_active;
  if v_role is distinct from 'admin'
    and exists(select 1 from customer_member_menu_scopes where organization_id=v_org and user_id=auth.uid())
    and not exists(select 1 from customer_member_menu_scopes where organization_id=v_org and user_id=auth.uid() and menu_id=p_menu_id)
  then raise exception 'menu_unavailable'; end if;
  select * into v_menu from customer_menu_assignments where id=p_menu_id and organization_id=v_org and is_active and cutoff_at>now() for update;
  if v_menu.id is null or v_menu.valid_until < v_today
    or not exists(select 1 from channels where id=v_menu.channel_id and is_active and archived_at is null) then
    raise exception 'menu_unavailable';
  end if;
  v_day := coalesce(p_service_date, case when v_menu.valid_until = v_menu.delivery_date then v_menu.delivery_date end);
  if v_day is null or v_day < v_today or v_day < v_menu.delivery_date or v_day > v_menu.valid_until then
    raise exception 'delivery_date_unavailable';
  end if;
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
  select id into v_rule from customer_reward_rules where effective_at<=now() order by effective_at desc limit 1;
  if v_rule is null then raise exception 'reward_rule_required'; end if;
  v_id:=gen_random_uuid();
  insert into orders(id,legacy_id,customer_id,channel_id,document_type,company_name_snapshot,customer_name_snapshot,
    email_snapshot,contact_number_a_snapshot,shipping_address_snapshot,delivery_at,delivery_time,shipping_fee,
    discount_amount,grand_total,outstanding,is_shopify_order,source_system)
  values(v_id,'web-quote-'||v_id,(select customer_id from customer_organizations where id=v_org),v_menu.channel_id,'quote',
    (select name from customer_organizations where id=v_org),v_address.recipient,(select email from auth.users where id=auth.uid()),
    v_address.phone,v_address.address,v_day::timestamp at time zone 'Asia/Hong_Kong',v_menu.delivery_time,
    v_menu.shipping_fee,0,v_food+v_menu.shipping_fee,v_food+v_menu.shipping_fee,false,'customer_portal');
  insert into order_lines(legacy_id,order_id,product_id,sku_snapshot,product_name_snapshot,quantity,unit_price,total_price,is_addon)
  select 'portal-line-'||gen_random_uuid(),v_id,p.id,p.sku,coalesce(nullif(p.chinese_name,''),p.name),x.quantity,i.unit_price,x.quantity*i.unit_price,false
    from customer_menu_items i join products p on p.id=i.product_id
    join jsonb_to_recordset(p_items) x(product_id uuid,quantity integer) on x.product_id=i.product_id where i.menu_id=p_menu_id;
  update customer_menu_items i set available_quantity=available_quantity-x.quantity
    from jsonb_to_recordset(p_items) x(product_id uuid,quantity integer) where i.menu_id=p_menu_id and i.product_id=x.product_id;
  insert into customer_portal_orders(order_id,organization_id,created_by,menu_id,request_id,reward_rule_id,food_amount,points_used)
    values(v_id,v_org,auth.uid(),p_menu_id,p_request_id,v_rule,v_food,0);
  return v_id;
end $$;
revoke all on function public.customer_portal_submit_order(uuid,uuid,uuid,jsonb,bigint,date) from public, anon;
grant execute on function public.customer_portal_submit_order(uuid,uuid,uuid,jsonb,bigint,date) to authenticated;

create or replace function public.customer_portal_snapshot()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_role text;
  v_today date := (timezone('Asia/Hong_Kong', now()))::date;
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
      'id',a.id,'name',a.name,'brand',c.name,'delivery_date',a.delivery_date,'valid_until',a.valid_until,'is_active',a.is_active
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
      'delivery_date',m.delivery_date,'valid_until',m.valid_until,'delivery_time',m.delivery_time,'cutoff_at',m.cutoff_at,'shipping_fee',m.shipping_fee,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product_id',p.id,'name',coalesce(nullif(p.chinese_name,''),p.name),
        'unit_price',i.unit_price,'available_quantity',i.available_quantity) order by p.name)
        from customer_menu_items i join products p on p.id=i.product_id
        where i.menu_id=m.id and p.channel_id=m.channel_id and p.is_active and p.archived_at is null),'[]')) order by m.delivery_date,m.name)
      from customer_menu_assignments m join channels c on c.id=m.channel_id and c.is_active and c.archived_at is null
      where m.organization_id=v_org and m.is_active and m.cutoff_at>now() and m.valid_until>=v_today
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

-- workspace-overlay
create or replace function public.customer_portal_workspace()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_snap jsonb:=public.customer_portal_snapshot();
begin
  if private.customer_has_permission('members') or private.customer_has_permission('menus') then
    v_snap:=v_snap||jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,'role',m.role,'is_active',m.is_active,
      'menu_ids',coalesce((select jsonb_agg(s.menu_id order by s.menu_id) from customer_member_menu_scopes s
        where s.organization_id=v_org and s.user_id=m.user_id),'[]'::jsonb)) order by m.created_at,m.user_id)
      from customer_memberships m join auth.users u on u.id=m.user_id where m.organization_id=v_org),'[]'::jsonb));
  else v_snap:=v_snap||jsonb_build_object('members','[]'::jsonb); end if;
  if private.customer_has_permission('menus') then
    v_snap:=v_snap||jsonb_build_object('org_menus',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.name,'brand',c.name,'delivery_date',a.delivery_date,'valid_until',a.valid_until,'is_active',a.is_active)
      order by a.delivery_date,a.id) from customer_menu_assignments a join channels c on c.id=a.channel_id
      where a.organization_id=v_org and a.is_active),'[]'::jsonb));
  else v_snap:=v_snap||jsonb_build_object('org_menus','[]'::jsonb); end if;
  if private.customer_has_permission('members') then
    v_snap:=v_snap||jsonb_build_object('invitations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'expires_at',i.expires_at,'created_at',i.created_at) order by i.created_at,i.id)
      from customer_invitations i where i.organization_id=v_org and i.accepted_at is null
        and i.revoked_at is null and i.expires_at>now()),'[]'::jsonb));
  else v_snap:=v_snap||jsonb_build_object('invitations','[]'::jsonb); end if;
  if not private.customer_has_permission('orders') then v_snap:=v_snap||jsonb_build_object('orders','[]'::jsonb); end if;
  if not private.customer_has_permission('points') then v_snap:=v_snap||jsonb_build_object('balance',0,'ledger','[]'::jsonb); end if;
  if not private.customer_has_permission('ordering') then v_snap:=v_snap||jsonb_build_object('menus','[]'::jsonb,'templates','[]'::jsonb); end if;
  if not private.customer_has_permission('delivery') then v_snap:=v_snap||jsonb_build_object('addresses','[]'::jsonb); end if;
  return v_snap||jsonb_build_object('permissions',private.customer_member_permission_catalog(v_org)||
    case when v_snap->>'role'='admin' then jsonb_build_object('members',true,'ordering',true,'orders',true,
      'export',true,'menus',true,'delivery',true,'points',true,'redeem',true,'settings',true) else '{}'::jsonb end,
    'memberPermissions',case when v_snap->>'role'='admin' then private.customer_member_permission_catalog(v_org) else null end);
end $$;
