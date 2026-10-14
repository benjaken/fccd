-- VIP lunch cycles are organization orders. Personal accounts cannot list or submit them.
alter table public.customer_portal_orders alter column menu_id drop not null;
alter table public.customer_portal_orders
  add column if not exists lunchbox_menu_id uuid references public.customer_lunchbox_menus(id);
alter table public.customer_portal_orders
  drop constraint if exists customer_portal_orders_menu_source;
alter table public.customer_portal_orders
  add constraint customer_portal_orders_menu_source
  check (menu_id is not null or lunchbox_menu_id is not null);

alter table public.customer_vip_batches
  add column if not exists organization_id uuid references public.customer_organizations(id);
create unique index if not exists customer_vip_batches_org_request
  on public.customer_vip_batches(organization_id, request_id)
  where organization_id is not null;

create or replace function public.customer_personal_vip_catalog()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  raise exception 'organization_required' using errcode = '42501';
end $$;

create or replace function public.customer_personal_submit_vip(p_request_id uuid, p_cycle_id uuid, p_address_id uuid, p_days jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  raise exception 'organization_required' using errcode = '42501';
end $$;

create or replace function public.customer_portal_vip_catalog()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  if to_regprocedure('private.customer_require_permission(text)') is not null then
    execute 'select private.customer_require_permission(''ordering'')';
  end if;
  perform private.customer_organization();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'cutoff_at', c.cutoff_at,
    'menus', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'brand', ch.name, 'delivery_date', m.delivery_date, 'delivery_time', m.delivery_time,
      'shipping_fee', m.shipping_fee,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'product_id', i.product_id, 'name', coalesce(nullif(p.chinese_name,''), p.name),
        'unit_price', i.unit_price, 'available_quantity', i.available_quantity
      ) order by coalesce(nullif(p.chinese_name,''), p.name))
        from customer_lunchbox_items i join products p on p.id=i.product_id
        where i.menu_id=m.id and p.is_active and p.archived_at is null and p.channel_id=m.channel_id), '[]')
    ) order by m.delivery_date, m.name)
      from customer_lunchbox_menus m join channels ch on ch.id=m.channel_id and ch.is_active and ch.archived_at is null
      where m.cycle_id=c.id and m.is_active), '[]')
  ) order by c.cutoff_at, c.name)
    from customer_vip_cycles c
    where c.is_active and c.cutoff_at > now()), '[]'::jsonb);
end $$;

create or replace function public.customer_portal_submit_vip(
  p_request_id uuid, p_cycle_id uuid, p_address_id uuid, p_days jsonb
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
  v_cutoff timestamptz; v_batch uuid; v_day record; v_order uuid; v_ids jsonb := '[]'::jsonb;
  v_menu customer_lunchbox_menus%rowtype; v_address customer_addresses%rowtype;
  v_food numeric(14,2); v_rule uuid; v_day_request uuid;
begin
  if to_regprocedure('private.customer_require_permission(text)') is not null then
    execute 'select private.customer_require_permission(''ordering'')';
  end if;
  perform private.customer_organization();
  if p_request_id is null then raise exception 'invalid_cart'; end if;
  select id into v_batch from customer_vip_batches where organization_id=v_org and request_id=p_request_id;
  if v_batch is not null then
    return coalesce((select jsonb_agg(order_id) from customer_vip_batch_orders where batch_id=v_batch), '[]'::jsonb);
  end if;
  select cutoff_at into v_cutoff from customer_vip_cycles where id=p_cycle_id and is_active for update;
  if v_cutoff is null or v_cutoff <= now() then raise exception 'menu_unavailable'; end if;
  if jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) not between 1 and 10 then
    raise exception 'invalid_cart';
  end if;
  if (select count(*) <> count(distinct menu_id) from jsonb_to_recordset(p_days) as x(menu_id uuid, items jsonb)) then
    raise exception 'duplicate_product';
  end if;
  if exists(
    select 1 from jsonb_to_recordset(p_days) as x(menu_id uuid, items jsonb)
    left join customer_lunchbox_menus m on m.id=x.menu_id and m.cycle_id=p_cycle_id and m.is_active
    where m.id is null or jsonb_typeof(x.items) is distinct from 'array' or jsonb_array_length(x.items) not between 1 and 50
  ) then raise exception 'menu_unavailable'; end if;
  select * into v_address from customer_addresses where id=p_address_id and organization_id=v_org and archived_at is null;
  if v_address.id is null then raise exception 'address_required'; end if;
  select id into v_rule from customer_reward_rules where effective_at<=now() order by effective_at desc limit 1;
  if v_rule is null then raise exception 'reward_rule_required'; end if;
  insert into customer_reward_accounts(organization_id) values(v_org) on conflict do nothing;
  insert into customer_vip_batches(user_id, organization_id, cycle_id, request_id)
    values (auth.uid(), v_org, p_cycle_id, p_request_id) returning id into v_batch;
  for v_day in select menu_id, items from jsonb_to_recordset(p_days) as x(menu_id uuid, items jsonb) loop
    v_day_request := private.customer_vip_day_request(p_request_id, v_day.menu_id);
    select order_id into v_order from customer_portal_orders where organization_id=v_org and request_id=v_day_request;
    if v_order is null then
      select * into v_menu from customer_lunchbox_menus where id=v_day.menu_id and cycle_id=p_cycle_id and is_active and cutoff_at>now() for update;
      if v_menu.id is null then raise exception 'menu_unavailable'; end if;
      if jsonb_typeof(v_day.items) is distinct from 'array' or jsonb_array_length(v_day.items) not between 1 and 50 then raise exception 'invalid_cart'; end if;
      if (select count(*)<>count(distinct product_id) from jsonb_to_recordset(v_day.items) as x(product_id uuid,quantity integer)) then raise exception 'duplicate_product'; end if;
      perform i.id from customer_lunchbox_items i
        join jsonb_to_recordset(v_day.items) x(product_id uuid,quantity integer) on x.product_id=i.product_id
        where i.menu_id=v_menu.id order by i.id for update of i;
      if exists(select 1 from jsonb_to_recordset(v_day.items) x(product_id uuid,quantity integer)
        left join customer_lunchbox_items i on i.menu_id=v_menu.id and i.product_id=x.product_id
        left join products p on p.id=x.product_id
        where i.id is null or x.quantity is null or x.quantity<=0 or x.quantity>i.available_quantity
          or not p.is_active or p.archived_at is not null or p.channel_id is distinct from v_menu.channel_id) then raise exception 'cart_unavailable'; end if;
      select sum(i.unit_price*x.quantity) into v_food from customer_lunchbox_items i
        join jsonb_to_recordset(v_day.items) x(product_id uuid,quantity integer) on x.product_id=i.product_id where i.menu_id=v_menu.id;
      v_order:=gen_random_uuid();
      insert into orders(id,legacy_id,customer_id,channel_id,document_type,company_name_snapshot,customer_name_snapshot,
        email_snapshot,contact_number_a_snapshot,shipping_address_snapshot,delivery_at,delivery_time,shipping_fee,
        discount_amount,grand_total,outstanding,is_shopify_order,source_system)
      values(v_order,'web-quote-'||v_order,(select customer_id from customer_organizations where id=v_org),v_menu.channel_id,'quote',
        (select name from customer_organizations where id=v_org),v_address.recipient,(select email from auth.users where id=auth.uid()),
        v_address.phone,v_address.address,v_menu.delivery_date::timestamp at time zone 'Asia/Hong_Kong',v_menu.delivery_time,
        v_menu.shipping_fee,0,v_food+v_menu.shipping_fee,v_food+v_menu.shipping_fee,false,'customer_portal');
      insert into order_lines(legacy_id,order_id,product_id,sku_snapshot,product_name_snapshot,quantity,unit_price,total_price,is_addon)
      select 'portal-line-'||gen_random_uuid(),v_order,p.id,p.sku,coalesce(nullif(p.chinese_name,''),p.name),x.quantity,i.unit_price,x.quantity*i.unit_price,false
        from customer_lunchbox_items i join products p on p.id=i.product_id
        join jsonb_to_recordset(v_day.items) x(product_id uuid,quantity integer) on x.product_id=i.product_id where i.menu_id=v_menu.id;
      update customer_lunchbox_items i set available_quantity=available_quantity-x.quantity
        from jsonb_to_recordset(v_day.items) x(product_id uuid,quantity integer) where i.menu_id=v_menu.id and i.product_id=x.product_id;
      insert into customer_portal_orders(order_id,organization_id,created_by,menu_id,lunchbox_menu_id,request_id,reward_rule_id,food_amount,points_used)
        values(v_order,v_org,auth.uid(),null,v_menu.id,v_day_request,v_rule,v_food,0);
    end if;
    insert into customer_vip_batch_orders(batch_id, order_id) values (v_batch, v_order);
    v_ids := v_ids || to_jsonb(v_order);
  end loop;
  return v_ids;
end $$;

revoke all on function public.customer_personal_vip_catalog() from public, anon;
revoke all on function public.customer_personal_submit_vip(uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function public.customer_portal_vip_catalog() from public, anon;
revoke all on function public.customer_portal_submit_vip(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.customer_personal_vip_catalog() to authenticated;
grant execute on function public.customer_personal_submit_vip(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.customer_portal_vip_catalog() to authenticated;
grant execute on function public.customer_portal_submit_vip(uuid, uuid, uuid, jsonb) to authenticated;
