-- Per-delivery-point minimum order quantity. FCC sets a minimum on the company
-- menu; when an admin sends a batch, every delivery point in that batch must
-- reach the minimum total, otherwise the whole batch is blocked with the
-- offending delivery points and their shortfall.
alter table public.customer_menu_assignments
  add column if not exists minimum_quantity integer not null default 0 check (minimum_quantity >= 0);

drop function if exists public.customer_portal_ops_upsert_menu(uuid,uuid,uuid,text,date,date,text,timestamptz,numeric,boolean);
create or replace function public.customer_portal_ops_upsert_menu(
  p_id uuid, p_org_id uuid, p_channel_id uuid, p_name text,
  p_delivery_date date, p_valid_until date, p_delivery_time text, p_cutoff_at timestamptz,
  p_shipping_fee numeric, p_is_active boolean, p_minimum_quantity integer default 0
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
    or p_cutoff_at is null or p_shipping_fee is null or p_shipping_fee < 0
    or p_minimum_quantity is null or p_minimum_quantity < 0 then
    raise exception 'invalid_menu';
  end if;
  if p_id is null then
    insert into customer_menu_assignments(
      organization_id,channel_id,name,delivery_date,valid_until,delivery_time,cutoff_at,shipping_fee,is_active,minimum_quantity
    ) values(
      p_org_id,p_channel_id,btrim(p_name),p_delivery_date,p_valid_until,btrim(p_delivery_time),p_cutoff_at,
      p_shipping_fee,coalesce(p_is_active,true),coalesce(p_minimum_quantity,0)
    ) returning id into v_id;
    return v_id;
  end if;
  update customer_menu_assignments set
    channel_id=p_channel_id, name=btrim(p_name), delivery_date=p_delivery_date, valid_until=p_valid_until,
    delivery_time=btrim(p_delivery_time), cutoff_at=p_cutoff_at, shipping_fee=p_shipping_fee,
    is_active=coalesce(p_is_active,is_active), minimum_quantity=coalesce(p_minimum_quantity,minimum_quantity)
  where id=p_id and organization_id=p_org_id returning id into v_id;
  if v_id is null then raise exception 'menu_required'; end if;
  return v_id;
end $$;
revoke all on function public.customer_portal_ops_upsert_menu(uuid,uuid,uuid,text,date,date,text,timestamptz,numeric,boolean,integer) from public, anon;
grant execute on function public.customer_portal_ops_upsert_menu(uuid,uuid,uuid,text,date,date,text,timestamptz,numeric,boolean,integer) to authenticated;

create or replace function public.customer_portal_ops_get_org(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org customer_organizations%rowtype;
begin
  perform private.customer_portal_ops_require(false);
  if p_org_id is null then raise exception 'organization_required'; end if;
  select * into v_org from customer_organizations where id=p_org_id;
  if v_org.id is null then raise exception 'organization_required'; end if;
  return jsonb_build_object(
    'id',v_org.id,'name',v_org.name,'customer_id',v_org.customer_id,'is_active',v_org.is_active,'is_vip',v_org.is_vip,
    'show_prices',v_org.show_prices,'created_at',v_org.created_at,
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,'role',m.role,'is_active',m.is_active,'created_at',m.created_at
    ) order by m.created_at) from customer_memberships m join auth.users u on u.id=m.user_id
      where m.organization_id=v_org.id),'[]'),
    'menus',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.name,'channel_id',a.channel_id,'brand',c.name,
      'delivery_date',a.delivery_date,'valid_until',a.valid_until,'delivery_time',a.delivery_time,'cutoff_at',a.cutoff_at,
      'shipping_fee',a.shipping_fee,'minimum_quantity',a.minimum_quantity,'is_active',a.is_active,
      'item_count',(select count(*)::int from customer_menu_items i where i.menu_id=a.id)
    ) order by a.delivery_date desc, a.name)
      from customer_menu_assignments a
      join channels c on c.id=a.channel_id
      where a.organization_id=v_org.id),'[]')
  );
end $$;

create or replace function public.customer_portal_send_member_requests(
  p_menu_id uuid, p_service_date date, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_batch uuid; v_ids jsonb:='[]'::jsonb;
  v_req record; v_menu customer_menu_assignments%rowtype; v_address customer_addresses%rowtype;
  v_order uuid; v_rule uuid; v_email text; v_shortfalls jsonb;
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
  if coalesce(v_menu.minimum_quantity,0) > 0 then
    select jsonb_agg(jsonb_build_object('address_id',g.address_id,'total',g.total,'minimum',v_menu.minimum_quantity))
      into v_shortfalls
      from (
        select r.address_id, sum((select coalesce(sum(x.quantity),0) from jsonb_to_recordset(r.items) x(product_id uuid, quantity integer))) total
        from customer_member_requests r
        where r.organization_id=v_org and r.menu_id=p_menu_id and r.service_date=p_service_date and r.status='submitted'
        group by r.address_id
      ) g
      where g.total < v_menu.minimum_quantity;
    if v_shortfalls is not null then
      raise exception 'minimum_not_met: %', v_shortfalls;
    end if;
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
