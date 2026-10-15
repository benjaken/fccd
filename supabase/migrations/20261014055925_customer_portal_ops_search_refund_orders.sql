-- Staff refund entry searches live orders instead of accepting a pasted id.
create or replace function public.customer_portal_ops_search_refund_orders(p_query text)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_query text; v_like text;
begin
  perform private.customer_portal_reward_rules_require(true);
  v_query := btrim(p_query);
  if v_query is null or char_length(v_query) < 2 or char_length(v_query) > 80 then
    return '[]'::jsonb;
  end if;
  v_like := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', found.id,
      'order_number', found.order_number,
      'customer_name', found.customer_name_snapshot,
      'company_name', found.company_name_snapshot,
      'phone', found.contact_number_a_snapshot,
      'delivery_at', found.delivery_at,
      'delivery_status', found.delivery_status,
      'grand_total', found.grand_total,
      'outstanding', found.outstanding,
      'shipping_fee', found.shipping_fee,
      'food_amount', found.food_amount
    ) order by found.delivery_at desc nulls last, found.created_at desc)
    from (
      select o.id, o.order_number, o.customer_name_snapshot, o.company_name_snapshot,
        o.contact_number_a_snapshot, o.delivery_at, o.delivery_status, o.grand_total,
        o.outstanding, o.shipping_fee, o.created_at,
        coalesce(po.food_amount, greatest(coalesce(o.grand_total, 0) - coalesce(o.shipping_fee, 0), 0)) as food_amount
      from orders o
      left join customer_portal_orders po on po.order_id = o.id
      where o.archived_at is null
        and o.document_type = 'order'
        and (
          o.order_number ilike v_like escape '\'
          or o.customer_name_snapshot ilike v_like escape '\'
          or o.company_name_snapshot ilike v_like escape '\'
          or o.contact_number_a_snapshot ilike v_like escape '\'
        )
      order by o.delivery_at desc nulls last, o.created_at desc
      limit 8
    ) found
  ), '[]'::jsonb);
end $$;

revoke all on function public.customer_portal_ops_search_refund_orders(text) from public, anon;
grant execute on function public.customer_portal_ops_search_refund_orders(text) to authenticated;
