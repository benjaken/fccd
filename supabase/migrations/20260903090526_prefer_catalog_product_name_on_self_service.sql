create or replace function public.customer_self_service_order_detail(
  p_session_token uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_order public.orders%rowtype;
  v_session private.customer_self_service_sessions%rowtype;
begin
  select * into v_session
  from private.customer_self_service_sessions session
  where session.token = p_session_token and session.expires_at > now();

  if v_session.token is null then
    raise exception 'self_service_session_expired' using errcode = '28000';
  end if;

  select * into v_order
  from public.orders orders
  where orders.id = p_order_id
    and orders.document_type = 'order'
    and orders.archived_at is null
    and private.self_service_order_matches(orders, v_session.phone_hash, v_session.email_hash);

  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'orderNumber', v_order.order_number,
    'orderDate', coalesce(v_order.bubble_created_at, v_order.created_at),
    'deliveryDate', v_order.delivery_at,
    'deliveryTime', v_order.delivery_time,
    'customerName', v_order.customer_name_snapshot,
    'companyName', v_order.company_name_snapshot,
    'phoneA', v_order.contact_number_a_snapshot,
    'phoneB', v_order.contact_number_b_snapshot,
    'email', v_order.email_snapshot,
    'maskedPhoneA', private.self_service_mask_phone(v_order.contact_number_a_snapshot),
    'maskedPhoneB', case
      when nullif(btrim(v_order.contact_number_b_snapshot), '') is null then null
      else private.self_service_mask_phone(v_order.contact_number_b_snapshot)
    end,
    'maskedEmail', private.self_service_mask_email(v_order.email_snapshot),
    'address', v_order.shipping_address_snapshot,
    'shippingMethod', (
      select coalesce(method.display_name, method.name)
      from public.shipping_methods method where method.id = v_order.shipping_method_id
    ),
    'deliveryStatus', v_order.delivery_status,
    'factoryArranged', coalesce(v_order.is_sent_to_factory, false),
    'fleetArranged', exists (
      select 1 from public.deliveries delivery
      where delivery.order_id = v_order.id and delivery.motorcade_id is not null
    ),
    'currency', v_order.currency,
    'grandTotal', coalesce(v_order.grand_total, 0),
    'outstanding', coalesce(v_order.outstanding, 0),
    'paid', coalesce(v_order.outstanding, 0) <= 0 and coalesce(v_order.grand_total, 0) > 0,
    'channelName', (select channel.name from public.channels channel where channel.id = v_order.channel_id),
    'channelEmail', (select channel.email from public.channels channel where channel.id = v_order.channel_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', line.id,
        'name', coalesce(
          nullif(btrim(product.name), ''),
          nullif(btrim(package.name), ''),
          nullif(btrim(line.product_name_snapshot), ''),
          line.content_snapshot,
          'Item'
        ),
        'content', line.content_snapshot,
        'quantity', coalesce(line.quantity, 0),
        'unitPrice', coalesce(line.unit_price, 0),
        'totalPrice', coalesce(line.total_price, coalesce(line.quantity, 0) * coalesce(line.unit_price, 0)),
        'isAddon', line.is_addon
      ) order by line.type_sort nulls last, line.item_order nulls last, line.created_at)
      from public.order_lines line
      left join public.products product on product.id = line.product_id
      left join public.packages package on package.id = line.package_id
      where line.order_id = v_order.id and not line.is_void
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', payment.id,
        'amount', payment.amount,
        'paymentAt', payment.payment_at,
        'method', method.name,
        'receiptReference', payment.receipt_reference
      ) order by coalesce(payment.payment_at, payment.created_at))
      from public.payments payment
      left join public.payment_methods method on method.id = payment.payment_method_id
      where payment.order_id = v_order.id and payment.voided_at is null
    ), '[]'::jsonb)
  );
end;
$$;
