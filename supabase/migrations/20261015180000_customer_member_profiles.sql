-- Per-member details an admin assigns: department, an approved delivery point
-- and whether the member may place orders at all. Admins always keep ordering.
alter table public.customer_memberships
  add column if not exists department text,
  add column if not exists delivery_point_id uuid references public.customer_addresses(id) on delete set null,
  add column if not exists can_order boolean not null default true;

-- Block a member whose ordering was switched off, even if the ordering
-- permission is on for the organization.
create or replace function private.customer_portal_orders_require_ordering()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if auth.uid() is not null then
    perform private.customer_require_permission('ordering');
    if not exists(
      select 1 from customer_memberships m
      where m.user_id=auth.uid() and m.organization_id=new.organization_id and m.is_active
        and (m.role='admin' or m.can_order)
    ) then raise exception 'ordering_disabled'; end if;
  end if;
  return new;
end $$;
drop trigger if exists customer_portal_orders_ordering on public.customer_portal_orders;
create trigger customer_portal_orders_ordering
  before insert on public.customer_portal_orders
  for each row execute function private.customer_portal_orders_require_ordering();

create or replace function public.customer_portal_set_member_profile(
  p_user_id uuid, p_department text, p_delivery_point_id uuid, p_can_order boolean
) returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_actor text;
begin
  perform private.customer_require_permission('members');
  if p_user_id is null or not exists(
    select 1 from customer_memberships where user_id=p_user_id and organization_id=v_org and is_active
  ) then raise exception 'member_not_found'; end if;
  if p_department is not null and length(btrim(p_department))>80 then raise exception 'invalid_member_profile'; end if;
  if p_delivery_point_id is not null and not exists(
    select 1 from customer_addresses where id=p_delivery_point_id and organization_id=v_org and archived_at is null
  ) then raise exception 'address_required'; end if;
  select role into v_actor from customer_memberships where user_id=auth.uid() and organization_id=v_org and is_active;
  if v_actor is distinct from 'admin' and exists(
    select 1 from customer_memberships where user_id=p_user_id and organization_id=v_org and role='admin'
  ) then raise exception 'permission_denied'; end if;
  update customer_memberships
    set department=nullif(btrim(p_department),''), delivery_point_id=p_delivery_point_id,
        can_order=coalesce(p_can_order,can_order)
    where user_id=p_user_id and organization_id=v_org;
end $$;
revoke all on function public.customer_portal_set_member_profile(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.customer_portal_set_member_profile(uuid,text,uuid,boolean) to authenticated;

create or replace function public.customer_portal_snapshot()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_role text;
  v_today date := (timezone('Asia/Hong_Kong', now()))::date;
  v_show boolean := private.customer_prices_visible();
begin
  select role into v_role from customer_memberships where user_id=auth.uid() and organization_id=v_org and is_active;
  return jsonb_build_object(
    'organization', (select jsonb_build_object('id',id,'name',name) from customer_organizations where id=v_org),
    'role',v_role, 'balance',private.customer_reward_balance(v_org), 'show_prices',v_show,
    'me', (select jsonb_build_object('department',m.department,'delivery_point_id',m.delivery_point_id,'can_order',m.can_order)
      from customer_memberships m where m.user_id=auth.uid() and m.organization_id=v_org),
    'addresses',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from customer_addresses a where organization_id=v_org and archived_at is null),'[]'),
    'members', case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,'role',m.role,'is_active',m.is_active,
      'department',m.department,'delivery_point_id',m.delivery_point_id,'can_order',m.can_order,
      'menu_ids',coalesce((select jsonb_agg(s.menu_id order by s.menu_id)
        from customer_member_menu_scopes s
        where s.organization_id=v_org and s.user_id=m.user_id),'[]'::jsonb)
    ) order by m.created_at)
      from customer_memberships m join auth.users u on u.id=m.user_id where m.organization_id=v_org),'[]') else '[]'::jsonb end,
    'org_menus', case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.name,'brand',c.name,'delivery_date',a.delivery_date,'valid_until',a.valid_until,'is_active',a.is_active
    ) order by a.delivery_date desc, a.name)
      from customer_menu_assignments a
      join channels c on c.id=a.channel_id
      where a.organization_id=v_org and a.is_active),'[]') else '[]'::jsonb end,
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
      'delivery_date',m.delivery_date,'valid_until',m.valid_until,'delivery_time',m.delivery_time,'cutoff_at',m.cutoff_at,
      'shipping_fee',case when v_show then m.shipping_fee else null end,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product_id',p.id,'name',coalesce(nullif(p.chinese_name,''),p.name),
        'unit_price',case when v_show then i.unit_price else null end,'available_quantity',i.available_quantity) order by p.name)
        from customer_menu_items i join products p on p.id=i.product_id
        where i.menu_id=m.id and p.channel_id=m.channel_id and p.is_active and p.archived_at is null),'[]')) order by m.delivery_date,m.name)
      from customer_menu_assignments m join channels c on c.id=m.channel_id and c.is_active and c.archived_at is null
      where m.organization_id=v_org and m.is_active and m.cutoff_at>now() and m.valid_until>=v_today
        and (
          v_role='admin'
          or not exists(
            select 1 from customer_member_menu_scopes s
            where s.organization_id=v_org and s.user_id=auth.uid()
          )
          or exists(
            select 1 from customer_member_menu_scopes s
            where s.organization_id=v_org and s.user_id=auth.uid() and s.menu_id=m.id
          )
        )),'[]'),
    'orders',coalesce((select jsonb_agg(jsonb_build_object('id',live.id,'number',live.order_number,'delivery_at',live.delivery_at,
      'status',live.delivery_status,
      'stage',case when live.document_type in ('quote','unconfirmed') then 'quote' else 'order' end,
      'total',case when v_show then live.grand_total else null end,'outstanding',case when v_show then live.outstanding else null end,
      'brand',c.name,
      'points_used',po.points_used,'cancel_status',cr.status,
      'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',l.product_id,'name',l.product_name_snapshot,
        'quantity',l.quantity,'unit_price',case when v_show then l.unit_price else null end)) from order_lines l where l.order_id=live.id and not l.is_void),'[]')) order by live.created_at desc)
      from customer_portal_orders po
      join orders linked on linked.id=po.order_id
      left join lateral (
        select n.id from orders n
        where n.source_quote_id=linked.id and n.document_type='order' and n.archived_at is null
        order by n.created_at desc limit 1
      ) converted on true
      join orders live on live.id=coalesce(converted.id, linked.id)
      join channels c on c.id=live.channel_id
      left join customer_cancel_requests cr on cr.order_id=live.id
      where po.organization_id=v_org and live.archived_at is null
        and (private.customer_is_admin() or po.created_by=auth.uid())),'[]'),
    'ledger',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from
      (select id,points,kind,order_id,actor_id,expires_at,created_at from customer_reward_entries
        where organization_id=v_org order by created_at desc limit 100) e),'[]')
  );
end $$;
