-- Reuse the existing read-only receipt renderer with organization authorization.
create function public.customer_portal_financial_document(p_order_id uuid,p_kind text)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_order orders%rowtype;
begin
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
