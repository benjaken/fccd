-- Per-member menu subset: admins assign which menus employees may order.
create table public.customer_member_menu_scopes (
  organization_id uuid not null references public.customer_organizations(id),
  user_id uuid not null references auth.users(id),
  menu_id uuid not null references public.customer_menu_assignments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, menu_id)
);
create index customer_member_menu_scopes_user_idx
  on public.customer_member_menu_scopes (organization_id, user_id);
alter table public.customer_member_menu_scopes enable row level security;
revoke all on table public.customer_member_menu_scopes from public, anon, authenticated;
grant all on table public.customer_member_menu_scopes to service_role;

create or replace function public.customer_portal_set_member_menu_scopes(p_user_id uuid, p_menu_ids uuid[])
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(true);
begin
  if p_user_id is null then raise exception 'member_not_found'; end if;
  if not exists(
    select 1 from customer_memberships
    where user_id=p_user_id and organization_id=v_org and is_active
  ) then raise exception 'member_not_found'; end if;
  if p_menu_ids is not null and exists(
    select 1 from unnest(p_menu_ids) mid(menu_id)
    left join customer_menu_assignments a on a.id=mid.menu_id and a.organization_id=v_org and a.is_active
    where a.id is null
  ) then raise exception 'menu_unavailable'; end if;
  delete from customer_member_menu_scopes where organization_id=v_org and user_id=p_user_id;
  if p_menu_ids is not null and cardinality(p_menu_ids) > 0 then
    insert into customer_member_menu_scopes(organization_id,user_id,menu_id)
      select distinct v_org, p_user_id, mid.menu_id from unnest(p_menu_ids) mid(menu_id);
  end if;
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

create or replace function public.customer_portal_submit_order(p_request_id uuid,p_menu_id uuid,p_address_id uuid,p_items jsonb,p_points bigint default 0)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_menu customer_menu_assignments%rowtype;
  v_address customer_addresses%rowtype; v_id uuid; v_food numeric(14,2); v_rule uuid; v_left bigint; v_take bigint; v_lot record;
  v_role text;
begin
  if p_request_id is null or p_points is null or p_points<0 or p_points%10<>0 then raise exception 'invalid_redemption'; end if;
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

do $$ begin
  revoke all on function public.customer_portal_set_member_menu_scopes(uuid,uuid[]) from public,anon;
  grant execute on function public.customer_portal_set_member_menu_scopes(uuid,uuid[]) to authenticated;
end $$;
