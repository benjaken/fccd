-- Personal lunchboxes use internal products and the existing quote record.
create table public.customer_lunchbox_menus (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id),
  name text not null,
  delivery_date date not null,
  delivery_time text not null,
  cutoff_at timestamptz not null,
  shipping_fee numeric(14,2) not null default 0 check (shipping_fee >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.customer_lunchbox_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.customer_lunchbox_menus(id),
  product_id uuid not null references public.products(id),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  available_quantity integer not null check (available_quantity >= 0),
  unique(menu_id, product_id)
);
create table public.customer_personal_quotes (
  order_id uuid primary key references public.orders(id),
  user_id uuid not null references auth.users(id),
  menu_id uuid not null references public.customer_lunchbox_menus(id),
  request_id uuid not null,
  food_amount numeric(14,2) not null,
  unique(user_id, request_id)
);
alter table public.customer_lunchbox_menus enable row level security;
alter table public.customer_lunchbox_items enable row level security;
alter table public.customer_personal_quotes enable row level security;
revoke all on public.customer_lunchbox_menus, public.customer_lunchbox_items, public.customer_personal_quotes from public, anon, authenticated;
grant all on public.customer_lunchbox_menus, public.customer_lunchbox_items, public.customer_personal_quotes to service_role;

create or replace function private.customer_portal_follow_converted_order()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.document_type = 'order' and new.source_quote_id is not null then
    update public.customer_portal_orders set order_id = new.id where order_id = new.source_quote_id;
    update public.customer_personal_quotes set order_id = new.id where order_id = new.source_quote_id;
    update private.customer_personal_order_links set order_id = new.id where order_id = new.source_quote_id;
  end if;
  return new;
end $$;

create or replace function public.customer_portal_ops_list_lunchboxes()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'name',m.name,'channel_id',m.channel_id,'brand',c.name,
    'delivery_date',m.delivery_date,'delivery_time',m.delivery_time,'cutoff_at',m.cutoff_at,
    'shipping_fee',m.shipping_fee,'is_active',m.is_active,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'product_id',i.product_id,'name',coalesce(nullif(p.chinese_name,''),p.name),'sku',p.sku,
      'unit_price',i.unit_price,'available_quantity',i.available_quantity
    ) order by coalesce(nullif(p.chinese_name,''),p.name))
      from customer_lunchbox_items i join products p on p.id=i.product_id where i.menu_id=m.id),'[]')
  ) order by m.delivery_date desc, m.name)
    from customer_lunchbox_menus m join channels c on c.id=m.channel_id),'[]'::jsonb);
end $$;

create or replace function public.customer_portal_ops_upsert_lunchbox(
  p_id uuid, p_channel_id uuid, p_name text, p_delivery_date date, p_delivery_time text,
  p_cutoff_at timestamptz, p_shipping_fee numeric, p_is_active boolean
)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid;
begin
  perform private.customer_portal_ops_require(true);
  if p_channel_id is null or not exists(select 1 from channels where id=p_channel_id and is_active and archived_at is null) then
    raise exception 'channel_required';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then raise exception 'invalid_menu'; end if;
  if p_delivery_date is null or p_delivery_time is null or length(btrim(p_delivery_time)) not between 1 and 40
    or p_cutoff_at is null or p_shipping_fee is null or p_shipping_fee < 0 then raise exception 'invalid_menu'; end if;
  if p_id is null then
    insert into customer_lunchbox_menus(channel_id,name,delivery_date,delivery_time,cutoff_at,shipping_fee,is_active)
      values(p_channel_id,btrim(p_name),p_delivery_date,btrim(p_delivery_time),p_cutoff_at,p_shipping_fee,coalesce(p_is_active,true))
      returning id into v_id;
    return v_id;
  end if;
  update customer_lunchbox_menus set channel_id=p_channel_id,name=btrim(p_name),delivery_date=p_delivery_date,
    delivery_time=btrim(p_delivery_time),cutoff_at=p_cutoff_at,shipping_fee=p_shipping_fee,is_active=coalesce(p_is_active,is_active)
    where id=p_id returning id into v_id;
  if v_id is null then raise exception 'menu_required'; end if;
  return v_id;
end $$;

create or replace function public.customer_portal_ops_replace_lunchbox_items(p_menu_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_channel uuid;
begin
  perform private.customer_portal_ops_require(true);
  select channel_id into v_channel from customer_lunchbox_menus where id=p_menu_id for update;
  if v_channel is null then raise exception 'menu_required'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 200 then raise exception 'invalid_menu_items'; end if;
  if jsonb_array_length(p_items) > 0 and (
    select count(*)<>count(distinct product_id) from jsonb_to_recordset(p_items) as x(product_id uuid, unit_price numeric, available_quantity integer)
  ) then raise exception 'duplicate_product'; end if;
  if exists(
    select 1 from jsonb_to_recordset(p_items) as x(product_id uuid, unit_price numeric, available_quantity integer)
    left join products p on p.id=x.product_id and p.is_active and p.archived_at is null and p.channel_id=v_channel
    where x.product_id is null or x.unit_price is null or x.unit_price < 0
      or x.available_quantity is null or x.available_quantity < 0 or x.available_quantity > 100000 or p.id is null
  ) then raise exception 'invalid_menu_items'; end if;
  delete from customer_lunchbox_items where menu_id=p_menu_id;
  insert into customer_lunchbox_items(menu_id,product_id,unit_price,available_quantity)
    select p_menu_id,x.product_id,x.unit_price,x.available_quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, unit_price numeric, available_quantity integer);
end $$;

create or replace function public.customer_personal_lunchbox_catalog()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user();
begin
  return jsonb_build_object(
    'menus',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'name',m.name,'brand',c.name,'delivery_date',m.delivery_date,'delivery_time',m.delivery_time,
      'cutoff_at',m.cutoff_at,'shipping_fee',m.shipping_fee,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'product_id',i.product_id,'name',coalesce(nullif(p.chinese_name,''),p.name),
        'unit_price',i.unit_price,'available_quantity',i.available_quantity) order by coalesce(nullif(p.chinese_name,''),p.name))
        from customer_lunchbox_items i join products p on p.id=i.product_id
        where i.menu_id=m.id and p.is_active and p.archived_at is null and p.channel_id=m.channel_id),'[]')
    ) order by m.delivery_date, m.name)
      from customer_lunchbox_menus m join channels c on c.id=m.channel_id and c.is_active and c.archived_at is null
      where m.is_active and m.cutoff_at>now()),'[]'),
    'orders',coalesce((select jsonb_agg(jsonb_build_object(
      'id',live.id,'number',live.order_number,'delivery_at',live.delivery_at,'total',live.grand_total,'outstanding',live.outstanding,
      'stage',case when live.document_type in ('quote','unconfirmed') then 'quote' else 'order' end
    ) order by live.created_at desc)
      from customer_personal_quotes q
      join orders linked on linked.id=q.order_id
      left join lateral (
        select n.id from orders n
        where n.source_quote_id=linked.id and n.document_type='order' and n.archived_at is null
        order by n.created_at desc limit 1
      ) converted on true
      join orders live on live.id=coalesce(converted.id, linked.id)
      where q.user_id=v_uid and live.archived_at is null),'[]')
  );
end $$;

create or replace function public.customer_personal_submit_lunchbox(
  p_request_id uuid, p_menu_id uuid, p_address_id uuid, p_items jsonb
)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user(); v_menu customer_lunchbox_menus%rowtype;
  v_address private.customer_personal_addresses%rowtype; v_id uuid; v_food numeric(14,2); v_name text;
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
  insert into customer_personal_quotes(order_id,user_id,menu_id,request_id,food_amount)
    values(v_id,v_uid,p_menu_id,p_request_id,v_food);
  insert into private.customer_personal_order_links(order_id,user_id,linked_by,reason)
    values(v_id,v_uid,v_uid,'personal_lunchbox');
  return v_id;
end $$;

revoke all on function public.customer_portal_ops_list_lunchboxes(),
  public.customer_portal_ops_upsert_lunchbox(uuid,uuid,text,date,text,timestamptz,numeric,boolean),
  public.customer_portal_ops_replace_lunchbox_items(uuid,jsonb),
  public.customer_personal_lunchbox_catalog(),
  public.customer_personal_submit_lunchbox(uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.customer_portal_ops_list_lunchboxes(),
  public.customer_portal_ops_upsert_lunchbox(uuid,uuid,text,date,text,timestamptz,numeric,boolean),
  public.customer_portal_ops_replace_lunchbox_items(uuid,jsonb) to authenticated;
grant execute on function public.customer_personal_lunchbox_catalog(),
  public.customer_personal_submit_lunchbox(uuid,uuid,uuid,jsonb) to authenticated;
