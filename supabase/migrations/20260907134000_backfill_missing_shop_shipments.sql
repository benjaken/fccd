-- Orders sent before automatic shipment creation was enabled have no
-- shop_shipments row and therefore cannot appear in restaurant receiving.
-- Replaying the standard shipment function keeps stock movements, warnings,
-- events and request statuses consistent with newly sent orders.

do $$
declare
  v_request record;
  v_previous_claims text := current_setting('request.jwt.claims', true);
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","app_metadata":{"role":"Super Admin"}}',
    true
  );

  for v_request in
    select
      request.id,
      jsonb_agg(
        jsonb_build_object(
          'request_line_id', line.id,
          'quantity', line.quantity
        )
        order by line.created_at
      ) as lines
    from public.shop_order_requests request
    join public.shop_order_lines line on line.request_id = request.id
    left join public.shop_shipments shipment on shipment.request_id = request.id
    where request.channel = 'fc_internal'
      and request.status = 'sent_to_factory'
      and shipment.id is null
    group by request.id
  loop
    perform public.ship_shop_order_request(v_request.id, v_request.lines);
  end loop;

  perform set_config(
    'request.jwt.claims',
    coalesce(v_previous_claims, ''),
    true
  );
end;
$$;
