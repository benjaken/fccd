-- VIP lunch: one cutoff for a cycle of lunchbox days, submitted together as one quote per day.
alter table public.customer_lunchbox_menus
  add column if not exists cycle_id uuid;

create table public.customer_vip_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cutoff_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.customer_lunchbox_menus
  drop constraint if exists customer_lunchbox_menus_cycle_id_fkey;
alter table public.customer_lunchbox_menus
  add constraint customer_lunchbox_menus_cycle_id_fkey
  foreign key (cycle_id) references public.customer_vip_cycles(id);

create table public.customer_vip_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  cycle_id uuid not null references public.customer_vip_cycles(id),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create table public.customer_vip_batch_orders (
  batch_id uuid not null references public.customer_vip_batches(id),
  order_id uuid not null,
  primary key (batch_id, order_id)
);
alter table public.customer_vip_cycles enable row level security;
alter table public.customer_vip_batches enable row level security;
alter table public.customer_vip_batch_orders enable row level security;
revoke all on public.customer_vip_cycles, public.customer_vip_batches, public.customer_vip_batch_orders from public, anon, authenticated;
grant all on public.customer_vip_cycles, public.customer_vip_batches, public.customer_vip_batch_orders to service_role;

create or replace function private.customer_vip_day_request(p_request uuid, p_menu uuid)
returns uuid language sql immutable as $$
  select (
    substr(md5(p_request::text || p_menu::text), 1, 8) || '-' ||
    substr(md5(p_request::text || p_menu::text), 9, 4) || '-' ||
    substr(md5(p_request::text || p_menu::text), 13, 4) || '-' ||
    substr(md5(p_request::text || p_menu::text), 17, 4) || '-' ||
    substr(md5(p_request::text || p_menu::text), 21, 12)
  )::uuid
$$;

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
      where m.is_active and m.cycle_id is null and m.cutoff_at>now()),'[]'),
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

create or replace function public.customer_portal_ops_upsert_vip_cycle(
  p_id uuid, p_name text, p_cutoff_at timestamptz, p_is_active boolean
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid;
begin
  perform private.customer_portal_ops_require(true);
  if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_cutoff_at is null then
    raise exception 'invalid_menu';
  end if;
  if p_id is null then
    insert into customer_vip_cycles(name, cutoff_at, is_active)
      values (btrim(p_name), p_cutoff_at, coalesce(p_is_active, true))
      returning id into v_id;
  else
    update customer_vip_cycles
      set name=btrim(p_name), cutoff_at=p_cutoff_at, is_active=coalesce(p_is_active, true)
      where id=p_id
      returning id into v_id;
    if v_id is null then raise exception 'menu_unavailable'; end if;
    update customer_lunchbox_menus set cutoff_at=p_cutoff_at where cycle_id=v_id;
  end if;
  return v_id;
end $$;

create or replace function public.customer_portal_ops_set_vip_cycle_menus(p_cycle_id uuid, p_menu_ids uuid[])
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_cutoff timestamptz;
begin
  perform private.customer_portal_ops_require(true);
  select cutoff_at into v_cutoff from customer_vip_cycles where id=p_cycle_id;
  if v_cutoff is null then raise exception 'menu_unavailable'; end if;
  if p_menu_ids is not null and exists(
    select 1 from unnest(p_menu_ids) mid(menu_id)
    left join customer_lunchbox_menus m on m.id=mid.menu_id and m.is_active
    where m.id is null
  ) then raise exception 'menu_unavailable'; end if;
  update customer_lunchbox_menus set cycle_id=null
    where cycle_id=p_cycle_id and (p_menu_ids is null or id <> all(p_menu_ids));
  if p_menu_ids is not null and cardinality(p_menu_ids) > 0 then
    update customer_lunchbox_menus set cycle_id=p_cycle_id, cutoff_at=v_cutoff
      where id = any(p_menu_ids);
  end if;
end $$;

create or replace function public.customer_portal_ops_list_vip_cycles()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'cutoff_at', c.cutoff_at, 'is_active', c.is_active,
    'menu_ids', coalesce((select jsonb_agg(m.id order by m.delivery_date) from customer_lunchbox_menus m where m.cycle_id=c.id), '[]'::jsonb)
  ) order by c.cutoff_at desc)
    from customer_vip_cycles c), '[]'::jsonb);
end $$;

create or replace function public.customer_personal_vip_catalog()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid := private.customer_personal_user();
begin
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

create or replace function public.customer_personal_submit_vip(
  p_request_id uuid, p_cycle_id uuid, p_address_id uuid, p_days jsonb
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid := private.customer_personal_user();
  v_cutoff timestamptz; v_batch uuid; v_day record; v_order uuid; v_ids jsonb := '[]'::jsonb;
begin
  if p_request_id is null then raise exception 'invalid_cart'; end if;
  select id into v_batch from customer_vip_batches where user_id=v_uid and request_id=p_request_id;
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
  insert into customer_vip_batches(user_id, cycle_id, request_id)
    values (v_uid, p_cycle_id, p_request_id) returning id into v_batch;
  for v_day in select menu_id, items from jsonb_to_recordset(p_days) as x(menu_id uuid, items jsonb) loop
    v_order := public.customer_personal_submit_lunchbox(
      private.customer_vip_day_request(p_request_id, v_day.menu_id), v_day.menu_id, p_address_id, v_day.items);
    insert into customer_vip_batch_orders(batch_id, order_id) values (v_batch, v_order);
    v_ids := v_ids || to_jsonb(v_order);
  end loop;
  return v_ids;
end $$;

revoke all on function public.customer_portal_ops_upsert_vip_cycle(uuid, text, timestamptz, boolean) from public, anon;
revoke all on function public.customer_portal_ops_set_vip_cycle_menus(uuid, uuid[]) from public, anon;
revoke all on function public.customer_portal_ops_list_vip_cycles() from public, anon;
revoke all on function public.customer_personal_vip_catalog() from public, anon;
revoke all on function public.customer_personal_submit_vip(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.customer_portal_ops_upsert_vip_cycle(uuid, text, timestamptz, boolean) to authenticated;
grant execute on function public.customer_portal_ops_set_vip_cycle_menus(uuid, uuid[]) to authenticated;
grant execute on function public.customer_portal_ops_list_vip_cycles() to authenticated;
grant execute on function public.customer_personal_vip_catalog() to authenticated;
grant execute on function public.customer_personal_submit_vip(uuid, uuid, uuid, jsonb) to authenticated;
