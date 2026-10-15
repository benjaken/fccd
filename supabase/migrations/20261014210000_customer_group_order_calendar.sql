-- Group ordering calendar: which companies are open, and holiday dates that refuse orders.
create table if not exists public.customer_order_blackouts (
  blackout_on date primary key,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
alter table public.customer_order_blackouts enable row level security;
revoke all on public.customer_order_blackouts from anon, authenticated;
grant all on public.customer_order_blackouts to service_role;

create or replace function public.customer_portal_ops_list_group_calendar(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 45 then
    raise exception 'invalid_range';
  end if;
  return jsonb_build_object(
    'blackouts', coalesce((select jsonb_agg(jsonb_build_object(
      'blackout_on', b.blackout_on, 'name', b.name
    ) order by b.blackout_on)
      from customer_order_blackouts b where b.blackout_on between p_from and p_to), '[]'::jsonb),
    'openings', coalesce((select jsonb_agg(jsonb_build_object(
      'organization_id', o.id, 'organization_name', o.name,
      'menu_id', a.id, 'menu_name', a.name, 'brand', c.name,
      'delivery_date', a.delivery_date, 'valid_until', a.valid_until
    ) order by o.name, a.name)
      from customer_menu_assignments a
      join customer_organizations o on o.id=a.organization_id and o.is_active
      join channels c on c.id=a.channel_id
      where a.is_active and a.delivery_date <= p_to and a.valid_until >= p_from), '[]'::jsonb)
  );
end $$;
revoke all on function public.customer_portal_ops_list_group_calendar(date, date) from public, anon;
grant execute on function public.customer_portal_ops_list_group_calendar(date, date) to authenticated;

create or replace function public.customer_portal_ops_set_order_blackout(
  p_day date, p_name text, p_remove boolean default false
) returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(true);
  if p_day is null then raise exception 'invalid_blackout'; end if;
  if coalesce(p_remove, false) then
    delete from customer_order_blackouts where blackout_on=p_day;
    return;
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'invalid_blackout'; end if;
  insert into customer_order_blackouts(blackout_on, name) values (p_day, btrim(p_name))
  on conflict (blackout_on) do update set name=excluded.name;
end $$;
revoke all on function public.customer_portal_ops_set_order_blackout(date, text, boolean) from public, anon;
grant execute on function public.customer_portal_ops_set_order_blackout(date, text, boolean) to authenticated;

create or replace function public.customer_portal_list_order_blackouts()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_today date := (timezone('Asia/Hong_Kong', now()))::date;
begin
  perform private.customer_organization();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'blackout_on', blackout_on, 'name', name
  ) order by blackout_on)
    from customer_order_blackouts where blackout_on >= v_today), '[]'::jsonb);
end $$;
revoke all on function public.customer_portal_list_order_blackouts() from public, anon;
grant execute on function public.customer_portal_list_order_blackouts() to authenticated;

-- ordering
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
  if exists(select 1 from customer_order_blackouts where blackout_on=v_day) then
    raise exception 'order_blackout';
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
