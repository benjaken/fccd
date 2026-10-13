-- Personal orders earn points on the personal account. Cancellation claws them back without a negative balance.
alter table public.customer_personal_quotes
  add column if not exists reward_rule_id uuid references public.customer_reward_rules(id),
  add column if not exists earned_at timestamptz;

create table if not exists public.customer_personal_reward_accounts (
  user_id uuid primary key references auth.users(id)
);
create table if not exists public.customer_personal_reward_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  points bigint not null,
  remaining_points bigint not null default 0 check (remaining_points >= 0),
  kind text not null check (kind in ('earn','redeem','return','expire','clawback')),
  order_id uuid references public.orders(id),
  event_key text not null unique,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.customer_personal_reward_pending (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  order_id uuid not null references public.orders(id),
  points bigint not null check (points > 0),
  event_key text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.customer_reward_pending (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.customer_organizations(id),
  order_id uuid not null references public.orders(id),
  points bigint not null check (points > 0),
  event_key text not null unique,
  created_at timestamptz not null default now()
);
alter table public.customer_personal_reward_accounts enable row level security;
alter table public.customer_personal_reward_entries enable row level security;
alter table public.customer_personal_reward_pending enable row level security;
alter table public.customer_reward_pending enable row level security;
revoke all on public.customer_personal_reward_accounts, public.customer_personal_reward_entries,
  public.customer_personal_reward_pending, public.customer_reward_pending from public, anon, authenticated;
grant all on public.customer_personal_reward_accounts, public.customer_personal_reward_entries,
  public.customer_personal_reward_pending, public.customer_reward_pending to service_role;

create or replace function private.customer_personal_reward_balance(p_user uuid)
returns bigint language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(sum(points),0)::bigint - coalesce(sum(remaining_points) filter (where expires_at <= now()),0)::bigint
  from public.customer_personal_reward_entries where user_id=p_user
$$;
revoke all on function private.customer_personal_reward_balance(uuid) from public, anon, authenticated;

create or replace function public.customer_personal_award_completed_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_quote customer_personal_quotes%rowtype; v_points bigint; v_threshold numeric; v_local date; v_expiry timestamptz;
begin
  select * into v_quote from customer_personal_quotes where order_id=p_order_id;
  if v_quote.order_id is null then return; end if;
  if not exists(select 1 from orders where id=p_order_id and document_type='order' and archived_at is null) then return; end if;
  insert into customer_personal_reward_accounts(user_id) values(v_quote.user_id) on conflict do nothing;
  perform 1 from customer_personal_reward_accounts where user_id=v_quote.user_id for update;
  select * into v_quote from customer_personal_quotes where order_id=p_order_id for update;
  if v_quote.earned_at is not null then return; end if;
  if not exists(select 1 from orders where id=p_order_id and document_type='order'
    and delivery_status in ('已送達','己送達','已取','已取貨') and archived_at is null) then return; end if;
  select r.hkd_per_point into v_threshold from customer_reward_rules r
    where r.id=coalesce(v_quote.reward_rule_id, (select id from customer_reward_rules where effective_at<=now() order by effective_at desc limit 1));
  v_points := case when v_threshold is null or v_threshold <= 0 then 0 else floor(v_quote.food_amount / v_threshold)::bigint end;
  v_local := (now() at time zone 'Asia/Hong_Kong')::date;
  v_expiry := ((v_local + interval '1 year')::date + time '23:59:59') at time zone 'Asia/Hong_Kong';
  if v_points > 0 then
    insert into customer_personal_reward_entries(user_id,points,remaining_points,kind,order_id,event_key,expires_at)
      values(v_quote.user_id,v_points,v_points,'earn',p_order_id,'earn:'||p_order_id,v_expiry);
  end if;
  update customer_personal_quotes set earned_at=now() where order_id=p_order_id;
end $$;
revoke all on function public.customer_personal_award_completed_order(uuid) from public, anon, authenticated;
grant execute on function public.customer_personal_award_completed_order(uuid) to service_role;

create or replace function public.customer_personal_clawback_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid; v_earned bigint; v_balance bigint; v_take bigint; v_left bigint; v_lot record;
begin
  select user_id into v_user from customer_personal_quotes where order_id=p_order_id;
  if v_user is null then return; end if;
  if exists(select 1 from customer_personal_reward_entries where event_key='clawback:'||p_order_id)
    or exists(select 1 from customer_personal_reward_pending where event_key='pending:'||p_order_id) then return; end if;
  select points into v_earned from customer_personal_reward_entries where event_key='earn:'||p_order_id and kind='earn';
  if coalesce(v_earned,0) <= 0 then return; end if;
  insert into customer_personal_reward_accounts(user_id) values(v_user) on conflict do nothing;
  perform 1 from customer_personal_reward_accounts where user_id=v_user for update;
  v_balance := greatest(private.customer_personal_reward_balance(v_user),0);
  v_take := least(v_earned, v_balance);
  v_left := v_take;
  if v_take > 0 then
    for v_lot in select id, remaining_points from customer_personal_reward_entries
      where user_id=v_user and remaining_points>0 and (expires_at is null or expires_at>now())
      order by expires_at nulls last, id for update loop
      exit when v_left=0;
      update customer_personal_reward_entries set remaining_points=remaining_points-least(v_left,v_lot.remaining_points) where id=v_lot.id;
      v_left := v_left-least(v_left,v_lot.remaining_points);
    end loop;
    insert into customer_personal_reward_entries(user_id,points,remaining_points,kind,order_id,event_key)
      values(v_user,-v_take,0,'clawback',p_order_id,'clawback:'||p_order_id);
  end if;
  if v_earned > v_take then
    insert into customer_personal_reward_pending(user_id,order_id,points,event_key)
      values(v_user,p_order_id,v_earned-v_take,'pending:'||p_order_id);
  end if;
end $$;
revoke all on function public.customer_personal_clawback_order(uuid) from public, anon, authenticated;
grant execute on function public.customer_personal_clawback_order(uuid) to service_role;

create or replace function public.customer_portal_clawback_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid; v_earned bigint; v_balance bigint; v_take bigint; v_left bigint; v_lot record;
begin
  select organization_id into v_org from customer_portal_orders where order_id=p_order_id;
  if v_org is null then return; end if;
  if exists(select 1 from customer_reward_entries where event_key='clawback:'||p_order_id)
    or exists(select 1 from customer_reward_pending where event_key='pending:'||p_order_id) then return; end if;
  select points into v_earned from customer_reward_entries where event_key='earn:'||p_order_id and kind='earn';
  if coalesce(v_earned,0) <= 0 then return; end if;
  insert into customer_reward_accounts(organization_id) values(v_org) on conflict do nothing;
  perform 1 from customer_reward_accounts where organization_id=v_org for update;
  v_balance := greatest(private.customer_reward_balance(v_org),0);
  v_take := least(v_earned, v_balance);
  v_left := v_take;
  if v_take > 0 then
    for v_lot in select id, remaining_points from customer_reward_entries
      where organization_id=v_org and remaining_points>0 and (expires_at is null or expires_at>now())
      order by expires_at nulls last, id for update loop
      exit when v_left=0;
      update customer_reward_entries set remaining_points=remaining_points-least(v_left,v_lot.remaining_points) where id=v_lot.id;
      v_left := v_left-least(v_left,v_lot.remaining_points);
    end loop;
    insert into customer_reward_entries(organization_id,points,remaining_points,kind,order_id,actor_id,event_key)
      values(v_org,-v_take,0,'clawback',p_order_id,null,'clawback:'||p_order_id);
  end if;
  if v_earned > v_take then
    insert into customer_reward_pending(organization_id,order_id,points,event_key)
      values(v_org,p_order_id,v_earned-v_take,'pending:'||p_order_id);
  end if;
end $$;
revoke all on function public.customer_portal_clawback_order(uuid) from public, anon, authenticated;
grant execute on function public.customer_portal_clawback_order(uuid) to service_role;

create or replace function private.customer_portal_completion_trigger()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if new.delivery_status in ('已送達','己送達','已取','已取貨') and new.delivery_status is distinct from old.delivery_status then
    perform public.customer_portal_award_completed_order(new.id);
    perform public.customer_personal_award_completed_order(new.id);
  elsif new.delivery_status in ('已取消','己取消','取消') and new.delivery_status is distinct from old.delivery_status then
    perform public.customer_portal_clawback_order(new.id);
    perform public.customer_personal_clawback_order(new.id);
  end if;
  return new;
end $$;

create or replace function public.customer_personal_points()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user();
begin
  return jsonb_build_object(
    'balance',private.customer_personal_reward_balance(v_uid),
    'pending',coalesce((select sum(points) from customer_personal_reward_pending where user_id=v_uid),0),
    'ledger',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'points',e.points,'kind',e.kind,'order_id',e.order_id,'expires_at',e.expires_at,'created_at',e.created_at
    ) order by e.created_at desc) from (
      select id,points,kind,order_id,expires_at,created_at from customer_personal_reward_entries
      where user_id=v_uid order by created_at desc limit 100
    ) e),'[]')
  );
end $$;
revoke all on function public.customer_personal_points() from public, anon;
grant execute on function public.customer_personal_points() to authenticated;

create or replace function public.customer_personal_submit_lunchbox(
  p_request_id uuid, p_menu_id uuid, p_address_id uuid, p_items jsonb
)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user(); v_menu customer_lunchbox_menus%rowtype;
  v_address private.customer_personal_addresses%rowtype; v_id uuid; v_food numeric(14,2); v_name text; v_rule uuid;
begin
  if p_request_id is null then raise exception 'invalid_cart'; end if;
  select order_id into v_id from customer_personal_quotes where user_id=v_uid and request_id=p_request_id;
  if v_id is not null then return v_id; end if;
  select * into v_menu from customer_lunchbox_menus where id=p_menu_id and is_active and cutoff_at>now() for update;
  if v_menu.id is null or not exists(select 1 from channels where id=v_menu.channel_id and is_active and archived_at is null) then
    raise exception 'menu_unavailable';
  end if;
  select * into v_address from private.customer_personal_addresses where id=p_address_id and user_id=v_uid;
  if v_address.id is null then raise exception 'address_required'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'invalid_cart'; end if;
  if (select count(*)<>count(distinct product_id) from jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer)) then raise exception 'duplicate_product'; end if;
  perform i.id from customer_lunchbox_items i
    join jsonb_to_recordset(p_items) x(product_id uuid,quantity integer) on x.product_id=i.product_id
    where i.menu_id=p_menu_id order by i.id for update of i;
  if exists(select 1 from jsonb_to_recordset(p_items) x(product_id uuid,quantity integer)
    left join customer_lunchbox_items i on i.menu_id=p_menu_id and i.product_id=x.product_id
    left join products p on p.id=x.product_id
    where i.id is null or x.quantity is null or x.quantity<=0 or x.quantity>i.available_quantity
      or not p.is_active or p.archived_at is not null or p.channel_id is distinct from v_menu.channel_id) then raise exception 'cart_unavailable'; end if;
  select sum(i.unit_price*x.quantity) into v_food from customer_lunchbox_items i
    join jsonb_to_recordset(p_items) x(product_id uuid,quantity integer) on x.product_id=i.product_id where i.menu_id=p_menu_id;
  select id into v_rule from customer_reward_rules where effective_at<=now() order by effective_at desc limit 1;
  select coalesce(nullif(btrim(name),''), '個人客戶') into v_name from private.customer_personal_profiles where user_id=v_uid;
  v_id:=gen_random_uuid();
  insert into orders(id,legacy_id,channel_id,document_type,company_name_snapshot,customer_name_snapshot,
    email_snapshot,contact_number_a_snapshot,shipping_address_snapshot,delivery_at,delivery_time,shipping_fee,
    discount_amount,grand_total,outstanding,is_shopify_order,source_system)
  values(v_id,'web-quote-'||v_id,v_menu.channel_id,'quote',coalesce(v_name,'個人客戶'),v_address.recipient,
    (select email from auth.users where id=v_uid),v_address.phone,v_address.address,
    v_menu.delivery_date::timestamp at time zone 'Asia/Hong_Kong',v_menu.delivery_time,v_menu.shipping_fee,
    0,v_food+v_menu.shipping_fee,v_food+v_menu.shipping_fee,false,'customer_portal');
  insert into order_lines(legacy_id,order_id,product_id,sku_snapshot,product_name_snapshot,quantity,unit_price,total_price,is_addon)
  select 'portal-line-'||gen_random_uuid(),v_id,p.id,p.sku,coalesce(nullif(p.chinese_name,''),p.name),x.quantity,i.unit_price,x.quantity*i.unit_price,false
    from customer_lunchbox_items i join products p on p.id=i.product_id
    join jsonb_to_recordset(p_items) x(product_id uuid,quantity integer) on x.product_id=i.product_id where i.menu_id=p_menu_id;
  update customer_lunchbox_items i set available_quantity=available_quantity-x.quantity
    from jsonb_to_recordset(p_items) x(product_id uuid,quantity integer) where i.menu_id=p_menu_id and i.product_id=x.product_id;
  insert into customer_personal_quotes(order_id,user_id,menu_id,request_id,food_amount,reward_rule_id)
    values(v_id,v_uid,p_menu_id,p_request_id,v_food,v_rule);
  insert into private.customer_personal_order_links(order_id,user_id,linked_by,reason)
    values(v_id,v_uid,v_uid,'personal_lunchbox');
  return v_id;
end $$;
