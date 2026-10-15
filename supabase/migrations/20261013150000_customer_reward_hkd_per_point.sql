-- Points are earned on completed food spend and cannot reduce the amount due.
alter table public.customer_reward_rules
  add column if not exists hkd_per_point numeric(12,4);

update public.customer_reward_rules
  set hkd_per_point = 25
  where hkd_per_point is null;

alter table public.customer_reward_rules
  alter column hkd_per_point set not null;

alter table public.customer_reward_rules
  drop constraint if exists customer_reward_rules_hkd_per_point_check;

alter table public.customer_reward_rules
  add constraint customer_reward_rules_hkd_per_point_check
  check (hkd_per_point >= 0 and hkd_per_point <= 100000);

create or replace function public.customer_portal_ops_list_reward_rules()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_reward_rules_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,
    'hkd_per_point',r.hkd_per_point,
    'effective_at',r.effective_at,
    'created_at',r.created_at,
    'created_by',r.created_by,
    'is_active',r.id = (
      select id from customer_reward_rules
      where effective_at <= now()
      order by effective_at desc
      limit 1
    )
  ) order by r.effective_at desc)
    from customer_reward_rules r),'[]'::jsonb);
end $$;

drop function if exists public.customer_portal_ops_create_reward_rule(numeric, timestamptz);

create function public.customer_portal_ops_create_reward_rule(
  p_hkd_per_point numeric,
  p_effective_at timestamptz
)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid;
begin
  perform private.customer_portal_reward_rules_require(true);
  if p_hkd_per_point is null or p_hkd_per_point < 0 or p_hkd_per_point > 100000 then
    raise exception 'invalid_reward_rule';
  end if;
  if p_effective_at is null then raise exception 'invalid_reward_rule'; end if;
  begin
    insert into customer_reward_rules(points_per_hkd, hkd_per_point, effective_at, created_by)
      values(0, p_hkd_per_point, p_effective_at, auth.uid())
      returning id into v_id;
  exception
    when unique_violation then
      raise exception 'duplicate_effective_at';
  end;
  return v_id;
end $$;

revoke all on function public.customer_portal_ops_create_reward_rule(numeric, timestamptz) from public, anon;
grant execute on function public.customer_portal_ops_create_reward_rule(numeric, timestamptz) to authenticated;

create or replace function public.customer_portal_submit_order(p_request_id uuid,p_menu_id uuid,p_address_id uuid,p_items jsonb,p_points bigint default 0)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_menu customer_menu_assignments%rowtype;
  v_address customer_addresses%rowtype; v_id uuid; v_food numeric(14,2); v_rule uuid;
  v_role text;
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
  select id into v_rule from customer_reward_rules where effective_at<=now() order by effective_at desc limit 1;
  if v_rule is null then raise exception 'reward_rule_required'; end if;
  v_id:=gen_random_uuid();
  insert into orders(id,legacy_id,customer_id,channel_id,document_type,company_name_snapshot,customer_name_snapshot,
    email_snapshot,contact_number_a_snapshot,shipping_address_snapshot,delivery_at,delivery_time,shipping_fee,
    discount_amount,grand_total,outstanding,is_shopify_order,source_system)
  values(v_id,'web-order-'||v_id,(select customer_id from customer_organizations where id=v_org),v_menu.channel_id,'order',
    (select name from customer_organizations where id=v_org),v_address.recipient,(select email from auth.users where id=auth.uid()),
    v_address.phone,v_address.address,v_menu.delivery_date::timestamp at time zone 'Asia/Hong_Kong',v_menu.delivery_time,
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

create or replace function public.customer_portal_award_completed_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_po customer_portal_orders%rowtype; v_points bigint; v_threshold numeric; v_local date; v_expiry timestamptz;
begin
  select * into v_po from customer_portal_orders where order_id=p_order_id;
  if v_po.order_id is null then return; end if;
  insert into customer_reward_accounts(organization_id) values(v_po.organization_id) on conflict do nothing;
  perform 1 from customer_reward_accounts where organization_id=v_po.organization_id for update;
  select * into v_po from customer_portal_orders where order_id=p_order_id for update;
  if v_po.earned_at is not null then return; end if;
  if not exists(select 1 from orders where id=p_order_id and delivery_status in ('已送達','己送達','已取','已取貨') and archived_at is null) then raise exception 'order_not_completed'; end if;
  select r.hkd_per_point into v_threshold
    from customer_reward_rules r where r.id=v_po.reward_rule_id;
  v_points := case
    when v_threshold is null or v_threshold <= 0 then 0
    else floor(v_po.food_amount / v_threshold)::bigint
  end;
  v_local := (now() at time zone 'Asia/Hong_Kong')::date;
  v_expiry := ((v_local + interval '1 year')::date + time '23:59:59') at time zone 'Asia/Hong_Kong';
  if v_points > 0 then
    insert into customer_reward_entries(organization_id,points,remaining_points,kind,order_id,event_key,expires_at)
      values(v_po.organization_id,v_points,v_points,'earn',p_order_id,'earn:'||p_order_id,v_expiry);
  end if;
  update customer_portal_orders set earned_at=now() where order_id=p_order_id;
end $$;
