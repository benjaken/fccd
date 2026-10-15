-- Meal calendar shows only organizations marked as VIP customers.
alter table public.customer_organizations
  add column if not exists is_vip boolean not null default false;

create or replace function public.customer_portal_ops_list_orgs()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',o.id,'name',o.name,'customer_id',o.customer_id,'is_active',o.is_active,'is_vip',o.is_vip,'created_at',o.created_at,
    'member_count',(select count(*)::int from customer_memberships m where m.organization_id=o.id and m.is_active),
    'admin_count',(select count(*)::int from customer_memberships m where m.organization_id=o.id and m.is_active and m.role='admin'),
    'menu_count',(select count(*)::int from customer_menu_assignments a where a.organization_id=o.id and a.is_active)
  ) order by o.created_at desc) from customer_organizations o),'[]'::jsonb);
end $$;

create or replace function public.customer_portal_ops_get_org(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org customer_organizations%rowtype;
begin
  perform private.customer_portal_ops_require(false);
  if p_org_id is null then raise exception 'organization_required'; end if;
  select * into v_org from customer_organizations where id=p_org_id;
  if v_org.id is null then raise exception 'organization_required'; end if;
  return jsonb_build_object(
    'id',v_org.id,'name',v_org.name,'customer_id',v_org.customer_id,'is_active',v_org.is_active,'is_vip',v_org.is_vip,'created_at',v_org.created_at,
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

drop function if exists public.customer_portal_ops_upsert_org(uuid, text, uuid, boolean);
create or replace function public.customer_portal_ops_upsert_org(
  p_id uuid, p_name text, p_customer_id uuid, p_is_active boolean, p_is_vip boolean default false
)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid;
begin
  perform private.customer_portal_ops_require(true);
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then raise exception 'invalid_organization'; end if;
  if p_customer_id is not null and not exists(select 1 from customers where id=p_customer_id) then
    raise exception 'customer_required';
  end if;
  if p_id is null then
    insert into customer_organizations(name,customer_id,is_active,is_vip)
      values(btrim(p_name),p_customer_id,coalesce(p_is_active,true),coalesce(p_is_vip,false)) returning id into v_id;
    return v_id;
  end if;
  update customer_organizations
    set name=btrim(p_name), customer_id=p_customer_id,
        is_active=coalesce(p_is_active,is_active), is_vip=coalesce(p_is_vip,is_vip)
    where id=p_id returning id into v_id;
  if v_id is null then raise exception 'organization_required'; end if;
  return v_id;
end $$;

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
      join customer_organizations o on o.id=a.organization_id and o.is_active and o.is_vip
      join channels c on c.id=a.channel_id
      where a.is_active and a.delivery_date <= p_to and a.valid_until >= p_from), '[]'::jsonb)
  );
end $$;

create or replace function public.customer_portal_ops_meal_calendar(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 45 then
    raise exception 'invalid_range';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.service_date, x.organization_name, x.order_number)
    from (
      select
        live.id as order_id,
        live.order_number,
        org.id::text as organization_id,
        org.name as organization_name,
        (timezone('Asia/Hong_Kong', live.delivery_at))::date as service_date,
        live.delivery_time,
        live.delivery_status,
        live.document_type,
        c.name as brand,
        live.shipping_address_snapshot as address,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', coalesce(nullif(btrim(l.product_name_snapshot), ''), '未命名餐點'),
            'quantity', l.quantity
          ) order by l.product_name_snapshot, l.id)
          from order_lines l
          where l.order_id = live.id and not l.is_void
        ), '[]'::jsonb) as lines
      from orders live
      left join customer_portal_orders po on po.order_id = live.id
      left join customer_portal_orders quoted on quoted.order_id = live.source_quote_id
      join customer_organizations org on org.id = coalesce(po.organization_id, quoted.organization_id) and org.is_vip
      left join channels c on c.id = live.channel_id
      where live.archived_at is null
        and live.delivery_at is not null
        and (timezone('Asia/Hong_Kong', live.delivery_at))::date between p_from and p_to
        and not exists (
          select 1 from orders newer
          where newer.source_quote_id = live.id
            and newer.document_type = 'order'
            and newer.archived_at is null
        )
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.customer_portal_ops_upsert_org(uuid, text, uuid, boolean, boolean) from public, anon;
grant execute on function public.customer_portal_ops_upsert_org(uuid, text, uuid, boolean, boolean) to authenticated;
revoke all on function public.customer_portal_ops_list_group_calendar(date, date) from public, anon;
grant execute on function public.customer_portal_ops_list_group_calendar(date, date) to authenticated;
revoke all on function public.customer_portal_ops_meal_calendar(date, date) from public, anon;
grant execute on function public.customer_portal_ops_meal_calendar(date, date) to authenticated;
