-- VIP lunch is a property of a lunchbox menu: toggling it attaches a single-day
-- VIP cycle built from the menu's own cutoff, so staff set everything in the
-- menu form instead of maintaining cycles in a separate panel.

drop function if exists public.customer_portal_ops_upsert_lunchbox(uuid, uuid, text, date, text, timestamptz, numeric, boolean);

create or replace function public.customer_portal_ops_upsert_lunchbox(
  p_id uuid, p_channel_id uuid, p_name text, p_delivery_date date, p_delivery_time text,
  p_cutoff_at timestamptz, p_shipping_fee numeric, p_is_active boolean, p_is_vip boolean default false
)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid; v_cycle uuid;
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
      returning id, cycle_id into v_id, v_cycle;
  else
    update customer_lunchbox_menus set channel_id=p_channel_id,name=btrim(p_name),delivery_date=p_delivery_date,
      delivery_time=btrim(p_delivery_time),cutoff_at=p_cutoff_at,shipping_fee=p_shipping_fee,is_active=coalesce(p_is_active,is_active)
      where id=p_id returning id, cycle_id into v_id, v_cycle;
    if v_id is null then raise exception 'menu_required'; end if;
  end if;
  if coalesce(p_is_vip,false) then
    if v_cycle is null then
      insert into customer_vip_cycles(name,cutoff_at,is_active)
        values(btrim(p_name),p_cutoff_at,true) returning id into v_cycle;
    else
      update customer_vip_cycles set name=btrim(p_name),cutoff_at=p_cutoff_at,is_active=true where id=v_cycle;
    end if;
    update customer_lunchbox_menus set cycle_id=v_cycle where id=v_id;
  elsif v_cycle is not null then
    update customer_lunchbox_menus set cycle_id=null where id=v_id;
    delete from customer_vip_cycles c where c.id=v_cycle
      and not exists(select 1 from customer_lunchbox_menus m where m.cycle_id=c.id);
  end if;
  return v_id;
end $$;

create or replace function public.customer_portal_ops_list_lunchboxes()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'name',m.name,'channel_id',m.channel_id,'brand',c.name,
    'delivery_date',m.delivery_date,'delivery_time',m.delivery_time,'cutoff_at',m.cutoff_at,
    'shipping_fee',m.shipping_fee,'is_active',m.is_active,'is_vip',m.cycle_id is not null,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'product_id',i.product_id,'name',coalesce(nullif(p.chinese_name,''),p.name),'sku',p.sku,
      'unit_price',i.unit_price,'available_quantity',i.available_quantity
    ) order by coalesce(nullif(p.chinese_name,''),p.name))
      from customer_lunchbox_items i join products p on p.id=i.product_id where i.menu_id=m.id),'[]')
  ) order by m.delivery_date desc, m.name)
    from customer_lunchbox_menus m join channels c on c.id=m.channel_id),'[]'::jsonb);
end $$;

create or replace function public.customer_portal_ops_delete_lunchbox(p_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_cycle uuid;
begin
  perform private.customer_portal_ops_require(true);
  if p_id is null or not exists (select 1 from public.customer_lunchbox_menus where id = p_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.customer_personal_quotes where menu_id = p_id)
    or exists (select 1 from public.customer_portal_orders where lunchbox_menu_id = p_id) then
    raise exception 'in_use' using errcode = 'P0001';
  end if;
  select cycle_id into v_cycle from public.customer_lunchbox_menus where id = p_id;
  delete from public.customer_lunchbox_items where menu_id = p_id;
  delete from public.customer_lunchbox_menus where id = p_id;
  delete from public.customer_vip_cycles c where c.id = v_cycle
    and not exists (select 1 from public.customer_lunchbox_menus m where m.cycle_id = c.id);
end;
$$;

revoke all on function public.customer_portal_ops_upsert_lunchbox(uuid, uuid, text, date, text, timestamptz, numeric, boolean, boolean) from public, anon;
grant execute on function public.customer_portal_ops_upsert_lunchbox(uuid, uuid, text, date, text, timestamptz, numeric, boolean, boolean) to authenticated;
