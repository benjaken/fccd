-- Staff operational config for customer portal orgs, menus and pricing.
insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
) values
  ('settings.customer_portal', '客戶訂購營運', '/settings/customer-portal', 126, false, 'promotion', 'page'),
  ('settings.customer_portal.edit', '編輯客戶訂購營運', null, 127, true, 'settings.customer_portal', 'action')
on conflict (page_key) do update set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, true, true
from (values ('Super Admin'), ('Admin')) roles(role)
cross join (values
  ('settings.customer_portal'),
  ('settings.customer_portal.edit'),
  ('promotion')
) pages(page_key)
on conflict (role, page_key) do update set
  can_access = true, can_manage = true, updated_at = now();

create or replace function private.customer_portal_ops_require(p_manage boolean default false)
returns void language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  if p_manage then
    if not private.has_page_access('settings.customer_portal.edit')
      and not private.has_page_manage('settings.customer_portal') then
      raise exception 'page_access_required' using errcode='42501';
    end if;
  elsif not private.has_page_access('settings.customer_portal') then
    raise exception 'page_access_required' using errcode='42501';
  end if;
end $$;
revoke all on function private.customer_portal_ops_require(boolean) from public, anon, authenticated;

create or replace function public.customer_portal_ops_list_orgs()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',o.id,'name',o.name,'customer_id',o.customer_id,'is_active',o.is_active,'created_at',o.created_at,
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
    'id',v_org.id,'name',v_org.name,'customer_id',v_org.customer_id,'is_active',v_org.is_active,'created_at',v_org.created_at,
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,'role',m.role,'is_active',m.is_active,'created_at',m.created_at
    ) order by m.created_at) from customer_memberships m join auth.users u on u.id=m.user_id
      where m.organization_id=v_org.id),'[]'),
    'menus',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.name,'channel_id',a.channel_id,'brand',c.name,
      'delivery_date',a.delivery_date,'delivery_time',a.delivery_time,'cutoff_at',a.cutoff_at,
      'shipping_fee',a.shipping_fee,'is_active',a.is_active,
      'item_count',(select count(*)::int from customer_menu_items i where i.menu_id=a.id)
    ) order by a.delivery_date desc, a.name)
      from customer_menu_assignments a
      join channels c on c.id=a.channel_id
      where a.organization_id=v_org.id),'[]')
  );
end $$;

create or replace function public.customer_portal_ops_upsert_org(
  p_id uuid, p_name text, p_customer_id uuid, p_is_active boolean
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
    insert into customer_organizations(name,customer_id,is_active)
      values(btrim(p_name),p_customer_id,coalesce(p_is_active,true)) returning id into v_id;
    return v_id;
  end if;
  update customer_organizations
    set name=btrim(p_name), customer_id=p_customer_id, is_active=coalesce(p_is_active,is_active)
    where id=p_id returning id into v_id;
  if v_id is null then raise exception 'organization_required'; end if;
  return v_id;
end $$;

create or replace function public.customer_portal_ops_assign_admin(p_org_id uuid, p_email text)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid; v_email text; v_existing customer_memberships%rowtype;
begin
  perform private.customer_portal_ops_require(true);
  if p_org_id is null or not exists(select 1 from customer_organizations where id=p_org_id) then
    raise exception 'organization_required';
  end if;
  if p_email is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email';
  end if;
  v_email:=lower(btrim(p_email));
  select id into v_user from auth.users where lower(email)=v_email and email_confirmed_at is not null;
  if v_user is null then raise exception 'user_not_found'; end if;
  select * into v_existing from customer_memberships where user_id=v_user;
  if v_existing.user_id is not null and v_existing.organization_id is distinct from p_org_id then
    raise exception 'membership_conflict';
  end if;
  insert into customer_memberships(user_id,organization_id,role,is_active)
    values(v_user,p_org_id,'admin',true)
    on conflict (user_id) do update
      set organization_id=excluded.organization_id, role='admin', is_active=true;
  return v_user;
end $$;

create or replace function public.customer_portal_ops_get_menu(p_menu_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_menu customer_menu_assignments%rowtype;
begin
  perform private.customer_portal_ops_require(false);
  if p_menu_id is null then raise exception 'menu_required'; end if;
  select * into v_menu from customer_menu_assignments where id=p_menu_id;
  if v_menu.id is null then raise exception 'menu_required'; end if;
  return jsonb_build_object(
    'id',v_menu.id,'organization_id',v_menu.organization_id,'name',v_menu.name,
    'channel_id',v_menu.channel_id,'brand',(select name from channels where id=v_menu.channel_id),
    'delivery_date',v_menu.delivery_date,'delivery_time',v_menu.delivery_time,
    'cutoff_at',v_menu.cutoff_at,'shipping_fee',v_menu.shipping_fee,'is_active',v_menu.is_active,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'product_id',i.product_id,'name',coalesce(nullif(p.chinese_name,''),p.name),
      'sku',p.sku,'unit_price',i.unit_price,'available_quantity',i.available_quantity
    ) order by coalesce(nullif(p.chinese_name,''),p.name))
      from customer_menu_items i join products p on p.id=i.product_id where i.menu_id=v_menu.id),'[]')
  );
end $$;

create or replace function public.customer_portal_ops_upsert_menu(
  p_id uuid, p_org_id uuid, p_channel_id uuid, p_name text,
  p_delivery_date date, p_delivery_time text, p_cutoff_at timestamptz,
  p_shipping_fee numeric, p_is_active boolean
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
  if p_delivery_date is null or p_delivery_time is null or length(btrim(p_delivery_time)) not between 1 and 40
    or p_cutoff_at is null or p_shipping_fee is null or p_shipping_fee < 0 then
    raise exception 'invalid_menu';
  end if;
  if p_id is null then
    insert into customer_menu_assignments(
      organization_id,channel_id,name,delivery_date,delivery_time,cutoff_at,shipping_fee,is_active
    ) values(
      p_org_id,p_channel_id,btrim(p_name),p_delivery_date,btrim(p_delivery_time),p_cutoff_at,
      p_shipping_fee,coalesce(p_is_active,true)
    ) returning id into v_id;
    return v_id;
  end if;
  update customer_menu_assignments set
    channel_id=p_channel_id, name=btrim(p_name), delivery_date=p_delivery_date,
    delivery_time=btrim(p_delivery_time), cutoff_at=p_cutoff_at, shipping_fee=p_shipping_fee,
    is_active=coalesce(p_is_active,is_active)
  where id=p_id and organization_id=p_org_id returning id into v_id;
  if v_id is null then raise exception 'menu_required'; end if;
  return v_id;
end $$;

create or replace function public.customer_portal_ops_replace_menu_items(p_menu_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_menu customer_menu_assignments%rowtype;
begin
  perform private.customer_portal_ops_require(true);
  if p_menu_id is null then raise exception 'menu_required'; end if;
  select * into v_menu from customer_menu_assignments where id=p_menu_id for update;
  if v_menu.id is null then raise exception 'menu_required'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'invalid_menu_items';
  end if;
  if jsonb_array_length(p_items) > 0 and (
    select count(*)<>count(distinct product_id)
    from jsonb_to_recordset(p_items) as x(product_id uuid, unit_price numeric, available_quantity integer)
  ) then raise exception 'duplicate_product'; end if;
  if exists(
    select 1 from jsonb_to_recordset(p_items) as x(product_id uuid, unit_price numeric, available_quantity integer)
    left join products p on p.id=x.product_id and p.is_active and p.archived_at is null and p.channel_id=v_menu.channel_id
    where x.product_id is null or x.unit_price is null or x.unit_price < 0
      or x.available_quantity is null or x.available_quantity < 0 or x.available_quantity > 100000
      or p.id is null
  ) then raise exception 'invalid_menu_items'; end if;
  delete from customer_menu_items where menu_id=p_menu_id;
  insert into customer_menu_items(menu_id,product_id,unit_price,available_quantity)
    select p_menu_id,x.product_id,x.unit_price,x.available_quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, unit_price numeric, available_quantity integer);
end $$;

create or replace function public.customer_portal_ops_list_channels()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name)
    from channels c where c.is_active and c.archived_at is null),'[]'::jsonb);
end $$;

create or replace function public.customer_portal_ops_list_products(p_channel_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  if p_channel_id is null then raise exception 'channel_required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'name',coalesce(nullif(p.chinese_name,''),p.name),'sku',p.sku,'price',p.price
  ) order by coalesce(nullif(p.chinese_name,''),p.name))
    from products p
    where p.channel_id=p_channel_id and p.is_active and p.archived_at is null),'[]'::jsonb);
end $$;

do $$ declare signature text; begin
  foreach signature in array array[
    'customer_portal_ops_list_orgs()',
    'customer_portal_ops_get_org(uuid)',
    'customer_portal_ops_upsert_org(uuid,text,uuid,boolean)',
    'customer_portal_ops_assign_admin(uuid,text)',
    'customer_portal_ops_get_menu(uuid)',
    'customer_portal_ops_upsert_menu(uuid,uuid,uuid,text,date,text,timestamptz,numeric,boolean)',
    'customer_portal_ops_replace_menu_items(uuid,jsonb)',
    'customer_portal_ops_list_channels()',
    'customer_portal_ops_list_products(uuid)'
  ] loop
    execute 'revoke all on function public.'||signature||' from public,anon';
    execute 'grant execute on function public.'||signature||' to authenticated';
  end loop;
end $$;
