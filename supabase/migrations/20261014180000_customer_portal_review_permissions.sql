-- Bind membership checks to the organization carried by this request. A missing
-- header retains the bootstrap/legacy selection; an invalid header never falls back.
create or replace function private.customer_organization(p_admin boolean default false)
returns uuid language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_id uuid; v_role text;
  v_requested text:=nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}')->>'x-customer-organization','');
begin
  select m.organization_id,m.role into v_id,v_role
  from customer_memberships m join customer_organizations o on o.id=m.organization_id and o.is_active
  join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
  left join customer_portal_active_organizations a on a.user_id=m.user_id
  where m.user_id=auth.uid() and m.is_active
    and (v_requested is null or m.organization_id::text=v_requested)
  order by (m.organization_id is not distinct from a.organization_id) desc,m.created_at,m.organization_id limit 1;
  if v_id is null or (p_admin and v_role is distinct from 'admin') then
    raise exception 'customer_membership_required' using errcode='P0001';
  end if;
  return v_id;
end $$;

create or replace function public.customer_portal_workspace()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_snap jsonb:=public.customer_portal_snapshot();
begin
  if private.customer_has_permission('members') or private.customer_has_permission('menus') then
    v_snap:=v_snap||jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,'role',m.role,'is_active',m.is_active,
      'menu_ids',coalesce((select jsonb_agg(s.menu_id order by s.menu_id) from customer_member_menu_scopes s
        where s.organization_id=v_org and s.user_id=m.user_id),'[]'::jsonb)) order by m.created_at,m.user_id)
      from customer_memberships m join auth.users u on u.id=m.user_id where m.organization_id=v_org),'[]'::jsonb));
  else v_snap:=v_snap||jsonb_build_object('members','[]'::jsonb); end if;
  if private.customer_has_permission('menus') then
    v_snap:=v_snap||jsonb_build_object('org_menus',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.name,'brand',c.name,'delivery_date',a.delivery_date,'is_active',a.is_active)
      order by a.delivery_date,a.id) from customer_menu_assignments a join channels c on c.id=a.channel_id
      where a.organization_id=v_org and a.is_active),'[]'::jsonb));
  else v_snap:=v_snap||jsonb_build_object('org_menus','[]'::jsonb); end if;
  if private.customer_has_permission('members') then
    v_snap:=v_snap||jsonb_build_object('invitations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'expires_at',i.expires_at,'created_at',i.created_at) order by i.created_at,i.id)
      from customer_invitations i where i.organization_id=v_org and i.accepted_at is null
        and i.revoked_at is null and i.expires_at>now()),'[]'::jsonb));
  else v_snap:=v_snap||jsonb_build_object('invitations','[]'::jsonb); end if;
  if not private.customer_has_permission('orders') then v_snap:=v_snap||jsonb_build_object('orders','[]'::jsonb); end if;
  if not private.customer_has_permission('points') then v_snap:=v_snap||jsonb_build_object('balance',0,'ledger','[]'::jsonb); end if;
  if not private.customer_has_permission('ordering') then v_snap:=v_snap||jsonb_build_object('menus','[]'::jsonb,'templates','[]'::jsonb); end if;
  if not private.customer_has_permission('delivery') then v_snap:=v_snap||jsonb_build_object('addresses','[]'::jsonb); end if;
  return v_snap||jsonb_build_object('permissions',private.customer_member_permission_catalog(v_org)||
    case when v_snap->>'role'='admin' then jsonb_build_object('members',true,'ordering',true,'orders',true,
      'export',true,'menus',true,'delivery',true,'points',true,'redeem',true,'settings',true) else '{}'::jsonb end,
    'memberPermissions',case when v_snap->>'role'='admin' then private.customer_member_permission_catalog(v_org) else null end);
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
    where o.id=p_order_id and po.organization_id=v_org and o.archived_at is null;
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
revoke all on function public.customer_portal_financial_document(uuid,text) from public,anon;
grant execute on function public.customer_portal_financial_document(uuid,text) to authenticated;
