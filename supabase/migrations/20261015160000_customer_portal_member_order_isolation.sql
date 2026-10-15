-- Members may only read their own orders in the active organization. Admins keep
-- the whole-company view required to review and manage orders. This closes the
-- gap where a member with the orders/export permission could list another
-- member's orders, export them or open their financial document.
create or replace function private.customer_is_admin()
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $$
  select exists(select 1 from customer_memberships m
    where m.user_id=auth.uid() and m.organization_id=private.customer_organization()
      and m.is_active and m.role='admin')
$$;
revoke all on function private.customer_is_admin() from public,anon,authenticated;

create or replace function public.customer_portal_snapshot()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_role text;
  v_today date := (timezone('Asia/Hong_Kong', now()))::date;
begin
  select role into v_role from customer_memberships where user_id=auth.uid() and organization_id=v_org and is_active;
  return jsonb_build_object(
    'organization', (select jsonb_build_object('id',id,'name',name) from customer_organizations where id=v_org),
    'role',v_role, 'balance',private.customer_reward_balance(v_org),
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
      'delivery_date',m.delivery_date,'valid_until',m.valid_until,'delivery_time',m.delivery_time,'cutoff_at',m.cutoff_at,'shipping_fee',m.shipping_fee,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product_id',p.id,'name',coalesce(nullif(p.chinese_name,''),p.name),
        'unit_price',i.unit_price,'available_quantity',i.available_quantity) order by p.name)
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
      'total',live.grand_total,'outstanding',live.outstanding,'brand',c.name,
      'points_used',po.points_used,'cancel_status',cr.status,
      'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',l.product_id,'name',l.product_name_snapshot,
        'quantity',l.quantity,'unit_price',l.unit_price)) from order_lines l where l.order_id=live.id and not l.is_void),'[]')) order by live.created_at desc)
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

create or replace function public.customer_portal_export_orders()
returns text language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
begin
  perform private.customer_require_permission('export');
  return 'number,delivery,status,total' || coalesce((
    select string_agg(E'\n' || coalesce(live.order_number, '') || ',' || to_char(live.delivery_at at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD') || ',' || coalesce(live.delivery_status, '') || ',' || live.grand_total::text, '' order by live.created_at desc)
    from customer_portal_orders po
    join orders live on live.id = po.order_id
    where po.organization_id = v_org and live.archived_at is null
      and (private.customer_is_admin() or po.created_by = auth.uid())
  ), '');
end $$;

-- Reuse the existing read-only receipt renderer with organization authorization.
create or replace function public.customer_portal_financial_document(p_order_id uuid,p_kind text)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_order orders%rowtype;
begin
  perform private.customer_require_permission('orders');
  perform private.customer_require_permission('export');
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

create or replace function public.customer_portal_request_cancel(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization();
begin
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'cancel_reason_required'; end if;
  if not exists(select 1 from customer_portal_orders po join orders o on o.id=po.order_id where po.organization_id=v_org
    and o.id=p_order_id and (private.customer_is_admin() or po.created_by=auth.uid())
    and not coalesce(o.is_shopify_order,false) and o.archived_at is null
    and coalesce(o.delivery_status,'') not in ('已取消','己取消','取消','已送達','己送達','送貨途中')) then raise exception 'order_not_cancellable'; end if;
  insert into customer_cancel_requests(order_id,organization_id,requested_by,reason)
    values(p_order_id,v_org,auth.uid(),btrim(p_reason)) on conflict(order_id) do nothing;
end $$;
