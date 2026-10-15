-- FCC/company admins decide whether members see amounts. When prices are hidden
-- the API, summaries, exports and downloads must not leak them either, so the
-- masking happens on the server rather than only in the UI.
alter table public.customer_organizations
  add column if not exists show_prices boolean not null default true;

-- Admins always see prices. Members see them only when the active organization
-- allows it. Any missing/legacy value is treated as visible.
create or replace function private.customer_prices_visible()
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $$
  select coalesce((
    select m.role='admin' or coalesce(o.show_prices,true)
    from customer_memberships m
    join customer_organizations o on o.id=m.organization_id
    where m.user_id=auth.uid() and m.organization_id=private.customer_organization() and m.is_active
  ),true)
$$;
revoke all on function private.customer_prices_visible() from public,anon,authenticated;

create or replace function public.customer_portal_ops_list_orgs()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',o.id,'name',o.name,'customer_id',o.customer_id,'is_active',o.is_active,'is_vip',o.is_vip,
    'show_prices',o.show_prices,'created_at',o.created_at,
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
    'id',v_org.id,'name',v_org.name,'customer_id',v_org.customer_id,'is_active',v_org.is_active,'is_vip',v_org.is_vip,
    'show_prices',v_org.show_prices,'created_at',v_org.created_at,
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

drop function if exists public.customer_portal_ops_upsert_org(uuid, text, uuid, boolean, boolean);
create or replace function public.customer_portal_ops_upsert_org(
  p_id uuid, p_name text, p_customer_id uuid, p_is_active boolean, p_is_vip boolean default false, p_show_prices boolean default true
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
    insert into customer_organizations(name,customer_id,is_active,is_vip,show_prices)
      values(btrim(p_name),p_customer_id,coalesce(p_is_active,true),coalesce(p_is_vip,false),coalesce(p_show_prices,true)) returning id into v_id;
    return v_id;
  end if;
  update customer_organizations
    set name=btrim(p_name), customer_id=p_customer_id,
        is_active=coalesce(p_is_active,is_active), is_vip=coalesce(p_is_vip,is_vip),
        show_prices=coalesce(p_show_prices,show_prices)
    where id=p_id returning id into v_id;
  if v_id is null then raise exception 'organization_required'; end if;
  return v_id;
end $$;
revoke all on function public.customer_portal_ops_upsert_org(uuid,text,uuid,boolean,boolean,boolean) from public,anon;
grant execute on function public.customer_portal_ops_upsert_org(uuid,text,uuid,boolean,boolean,boolean) to authenticated;

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
    'addresses',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from customer_addresses a where organization_id=v_org and archived_at is null),'[]'),
    'members', case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,'role',m.role,'is_active',m.is_active,
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

create or replace function public.customer_portal_vip_catalog()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_show boolean := private.customer_prices_visible();
begin
  if to_regprocedure('private.customer_require_permission(text)') is not null then
    execute 'select private.customer_require_permission(''ordering'')';
  end if;
  perform private.customer_organization();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'cutoff_at', c.cutoff_at,
    'menus', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'brand', ch.name, 'delivery_date', m.delivery_date, 'delivery_time', m.delivery_time,
      'shipping_fee', case when v_show then m.shipping_fee else null end,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'product_id', i.product_id, 'name', coalesce(nullif(p.chinese_name,''), p.name),
        'unit_price', case when v_show then i.unit_price else null end, 'available_quantity', i.available_quantity
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

create or replace function public.customer_portal_evidence()
returns jsonb language sql stable security definer set search_path=public,private,pg_temp as $$
select coalesce(jsonb_agg(jsonb_build_object('id',id,'order_id',order_id,
  'amount',case when private.customer_prices_visible() then amount else null end,'status',status,
  'review_reason',review_reason,'created_at',created_at) order by created_at desc),'[]')
from customer_payment_evidence where organization_id=private.customer_organization()
$$;

create or replace function public.customer_portal_export_orders()
returns text language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_show boolean := private.customer_prices_visible();
begin
  perform private.customer_require_permission('export');
  return 'number,delivery,status,total' || coalesce((
    select string_agg(E'\n' || coalesce(live.order_number, '') || ',' || to_char(live.delivery_at at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD') || ',' || coalesce(live.delivery_status, '') || ',' || case when v_show then live.grand_total::text else '' end, '' order by live.created_at desc)
    from customer_portal_orders po
    join orders live on live.id = po.order_id
    where po.organization_id = v_org and live.archived_at is null
      and (private.customer_is_admin() or po.created_by = auth.uid())
  ), '');
end $$;

-- A financial document is inherently monetary: members cannot open one while
-- prices are hidden. Admins are unaffected.
create or replace function public.customer_portal_financial_document(p_order_id uuid,p_kind text)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_order orders%rowtype;
begin
  perform private.customer_require_permission('orders');
  perform private.customer_require_permission('export');
  if not private.customer_prices_visible() then raise exception 'permission_denied'; end if;
  if p_kind is null or p_kind not in ('receipt','invoice') then raise exception 'invalid_document_kind'; end if;
  select o.* into v_order from orders o join customer_portal_orders po on po.order_id=o.id
    where o.id=p_order_id and po.organization_id=v_org and o.archived_at is null
      and (private.customer_is_admin() or po.created_by=auth.uid());
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if coalesce(v_order.outstanding,1)>0 or coalesce(v_order.delivery_status,'') in ('已取消','己取消','取消') then
    raise exception 'payment_not_verified';
  end if;
  if coalesce(v_order.grand_total,0)>0 and not exists(select 1 from payments where order_id=v_order.id and voided_at is null and amount>0) then
    raise exception 'payment_not_verified';
  end if;
  return jsonb_build_object(
    'id',v_order.id,'orderNumber',v_order.order_number,'orderDate',v_order.created_at,
    'deliveryDate',v_order.delivery_at,'deliveryTime',v_order.delivery_time,
    'customerName',v_order.customer_name_snapshot,'companyName',v_order.company_name_snapshot,
    'phoneA',v_order.contact_number_a_snapshot,'phoneB',v_order.contact_number_b_snapshot,
    'email',v_order.email_snapshot,'maskedPhoneA','', 'maskedPhoneB',null,'maskedEmail','',
    'address',v_order.shipping_address_snapshot,'shippingMethod',null,'deliveryStatus',v_order.delivery_status,
    'factoryArranged',v_order.is_sent_to_factory,'fleetArranged',false,'currency',v_order.currency,
    'shippingFee',v_order.shipping_fee,'discount',v_order.discount_amount,
    'cashdollarRedeemed',v_order.cashdollar_redeemed,'cashdollarPurchased',v_order.cashdollar_purchased,
    'grandTotal',v_order.grand_total,'outstanding',v_order.outstanding,'paid',true,
    'channelName',(select name from channels where id=v_order.channel_id),
    'channelEmail',(select email from channels where id=v_order.channel_id),'shopifyStoreDomain',null,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',product_name_snapshot,
      'content',content_snapshot,'quantity',quantity,'unitPrice',unit_price,'totalPrice',total_price,'isAddon',is_addon)
      order by item_order,created_at) from order_lines where order_id=v_order.id and not is_void),'[]'),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'paymentAt',p.payment_at,
      'method',m.name,'receiptReference',p.receipt_reference)) from payments p left join payment_methods m on m.id=p.payment_method_id
      where p.order_id=v_order.id and p.voided_at is null),'[]')
  );
end $$;
