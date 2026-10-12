-- Saved order templates (常用訂單): named item/quantity presets per organization.
create table public.customer_order_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.customer_organizations(id),
  name text not null,
  created_by uuid not null references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.customer_order_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.customer_order_templates(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0 and quantity <= 999),
  unique (template_id, product_id)
);
alter table public.customer_order_templates enable row level security;
alter table public.customer_order_template_items enable row level security;
revoke all on table public.customer_order_templates from public, anon, authenticated;
revoke all on table public.customer_order_template_items from public, anon, authenticated;
grant all on table public.customer_order_templates to service_role;
grant all on table public.customer_order_template_items to service_role;

create or replace function public.customer_portal_save_template(p_name text, p_items jsonb)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_id uuid; v_count int;
begin
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'invalid_template'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'invalid_template';
  end if;
  if (select count(*)<>count(distinct product_id) from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)) then
    raise exception 'duplicate_product';
  end if;
  if exists(
    select 1 from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    left join products p on p.id=x.product_id and p.is_active and p.archived_at is null
    where x.product_id is null or x.quantity is null or x.quantity<=0 or x.quantity>999 or p.id is null
  ) then raise exception 'invalid_template'; end if;
  insert into customer_order_templates(organization_id,name,created_by)
    values(v_org,btrim(p_name),auth.uid()) returning id into v_id;
  insert into customer_order_template_items(template_id,product_id,quantity)
    select v_id,x.product_id,x.quantity from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer);
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'invalid_template'; end if;
  return v_id;
end $$;

create or replace function public.customer_portal_update_template(p_id uuid, p_name text, p_items jsonb)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization();
begin
  if p_id is null or p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'invalid_template'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'invalid_template';
  end if;
  if (select count(*)<>count(distinct product_id) from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)) then
    raise exception 'duplicate_product';
  end if;
  if exists(
    select 1 from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    left join products p on p.id=x.product_id and p.is_active and p.archived_at is null
    where x.product_id is null or x.quantity is null or x.quantity<=0 or x.quantity>999 or p.id is null
  ) then raise exception 'invalid_template'; end if;
  update customer_order_templates set name=btrim(p_name), updated_at=now()
    where id=p_id and organization_id=v_org and archived_at is null;
  if not found then raise exception 'template_not_found'; end if;
  delete from customer_order_template_items where template_id=p_id;
  insert into customer_order_template_items(template_id,product_id,quantity)
    select p_id,x.product_id,x.quantity from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer);
end $$;

create or replace function public.customer_portal_archive_template(p_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization();
begin
  if p_id is null then raise exception 'template_not_found'; end if;
  update customer_order_templates set archived_at=now(), updated_at=now()
    where id=p_id and organization_id=v_org and archived_at is null;
  if not found then raise exception 'template_not_found'; end if;
end $$;

create or replace function public.customer_portal_snapshot()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_role text;
begin
  select role into v_role from customer_memberships where user_id=auth.uid();
  return jsonb_build_object(
    'organization', (select jsonb_build_object('id',id,'name',name) from customer_organizations where id=v_org),
    'role',v_role, 'balance',private.customer_reward_balance(v_org),
    'addresses',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from customer_addresses a where organization_id=v_org and archived_at is null),'[]'),
    'members', case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,'role',m.role,'is_active',m.is_active) order by m.created_at)
      from customer_memberships m join auth.users u on u.id=m.user_id where m.organization_id=v_org),'[]') else '[]'::jsonb end,
    'invitations', case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'expires_at',i.expires_at,'created_at',i.created_at) order by i.created_at desc)
      from customer_invitations i
      where i.organization_id=v_org and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()),'[]')
      else '[]'::jsonb end,
    'templates', coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'name',t.name,'updated_at',t.updated_at,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'product_id',i.product_id,
        'name',coalesce(nullif(p.chinese_name,''),p.name),
        'quantity',i.quantity) order by coalesce(nullif(p.chinese_name,''),p.name))
        from customer_order_template_items i
        join products p on p.id=i.product_id
        where i.template_id=t.id),'[]')) order by t.updated_at desc, t.name)
      from customer_order_templates t
      where t.organization_id=v_org and t.archived_at is null),'[]'),
    'menus',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'name',m.name,'brand',c.name,'channel_id',m.channel_id,
      'delivery_date',m.delivery_date,'delivery_time',m.delivery_time,'cutoff_at',m.cutoff_at,'shipping_fee',m.shipping_fee,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product_id',p.id,'name',coalesce(nullif(p.chinese_name,''),p.name),
        'unit_price',i.unit_price,'available_quantity',i.available_quantity) order by p.name)
        from customer_menu_items i join products p on p.id=i.product_id
        where i.menu_id=m.id and p.channel_id=m.channel_id and p.is_active and p.archived_at is null),'[]')) order by m.delivery_date,m.name)
      from customer_menu_assignments m join channels c on c.id=m.channel_id and c.is_active and c.archived_at is null
      where m.organization_id=v_org and m.is_active and m.cutoff_at>now()),'[]'),
    'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'number',o.order_number,'delivery_at',o.delivery_at,
      'status',o.delivery_status,'total',o.grand_total,'outstanding',o.outstanding,'brand',c.name,
      'points_used',po.points_used,'cancel_status',cr.status,
      'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',l.product_id,'name',l.product_name_snapshot,
        'quantity',l.quantity,'unit_price',l.unit_price)) from order_lines l where l.order_id=o.id and not l.is_void),'[]')) order by o.created_at desc)
      from customer_portal_orders po join orders o on o.id=po.order_id join channels c on c.id=o.channel_id
      left join customer_cancel_requests cr on cr.order_id=o.id
      where po.organization_id=v_org and o.archived_at is null),'[]'),
    'ledger',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from
      (select id,points,kind,order_id,actor_id,expires_at,created_at from customer_reward_entries
        where organization_id=v_org order by created_at desc limit 100) e),'[]')
  );
end $$;

do $$ declare signature text; begin
  foreach signature in array array[
    'customer_portal_save_template(text,jsonb)',
    'customer_portal_update_template(uuid,text,jsonb)',
    'customer_portal_archive_template(uuid)'
  ] loop
    execute 'revoke all on function public.'||signature||' from public,anon';
    execute 'grant execute on function public.'||signature||' to authenticated';
  end loop;
end $$;
