-- Expose existing product media only through the authorized, active lunchbox catalog.
create or replace function public.customer_personal_lunchbox_catalog()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user();
begin
  return jsonb_build_object(
    'menus',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'name',m.name,'brand',c.name,'delivery_date',m.delivery_date,'delivery_time',m.delivery_time,
      'cutoff_at',m.cutoff_at,'shipping_fee',m.shipping_fee,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'product_id',i.product_id,'name',coalesce(nullif(p.chinese_name,''),p.name),
        'unit_price',i.unit_price,'available_quantity',i.available_quantity,'image_url',p.image_url,'description',p.description) order by coalesce(nullif(p.chinese_name,''),p.name))
        from customer_lunchbox_items i join products p on p.id=i.product_id
        where i.menu_id=m.id and p.is_active and p.archived_at is null and p.channel_id=m.channel_id),'[]')
    ) order by m.delivery_date, m.name)
      from customer_lunchbox_menus m join channels c on c.id=m.channel_id and c.is_active and c.archived_at is null
      where m.is_active and m.cycle_id is null and m.cutoff_at>now()),'[]'),
    'orders',coalesce((select jsonb_agg(jsonb_build_object(
      'id',live.id,'number',live.order_number,'delivery_at',live.delivery_at,'total',live.grand_total,'outstanding',live.outstanding,
      'stage',case when live.document_type in ('quote','unconfirmed') then 'quote' else 'order' end
    ) order by live.created_at desc)
      from customer_personal_quotes q
      join orders linked on linked.id=q.order_id
      left join lateral (
        select n.id from orders n
        where n.source_quote_id=linked.id and n.document_type='order' and n.archived_at is null
        order by n.created_at desc limit 1
      ) converted on true
      join orders live on live.id=coalesce(converted.id, linked.id)
      where q.user_id=v_uid and live.archived_at is null),'[]')
  );
end $$;
