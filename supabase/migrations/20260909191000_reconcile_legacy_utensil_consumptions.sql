-- Legacy commitment orders do not replace an existing consumption when only
-- the canonical material quantity changes. Reverse and rebuild current/future
-- utensil consumptions once so six-person packs use the new six-setting rule.
do $reconcile_legacy_utensils$
declare
  affected record;
begin
  for affected in
    select distinct orders.id as order_id, orders.material_commitment_v2
    from public.orders orders
    join public.order_lines line on line.order_id = orders.id
    join public.deliveries delivery on delivery.order_id = orders.id
    where line.is_void is false
      and regexp_replace(
        coalesce(nullif(line.product_name_snapshot, ''), line.content_snapshot, ''),
        '\s+', '', 'g'
      ) ~ '^(餐具包(?:[(（]6位[)）])?|飯盒餐具包[0-9]+(?:\.[0-9]+)?份)$'
      and private.delivery_material_is_committed(delivery.delivery_status)
      and (delivery.delivery_at at time zone 'Asia/Hong_Kong')::date >=
        (now() at time zone 'Asia/Hong_Kong')::date
    order by orders.id
  loop
    if affected.material_commitment_v2 then
      perform private.reconcile_order_material_consumption(
        affected.order_id,
        'six_setting_utensil_rule_deployed'
      );
    else
      perform private.lock_material_writes();
      perform pg_advisory_xact_lock(hashtextextended(affected.order_id::text, 0));
      perform private.reverse_order_material_consumptions(
        affected.order_id,
        'six_setting_utensil_rule_deployed'
      );
      perform private.reconcile_legacy_material_consumption(
        affected.order_id,
        'six_setting_utensil_rule_deployed'
      );
    end if;
  end loop;
end
$reconcile_legacy_utensils$;
