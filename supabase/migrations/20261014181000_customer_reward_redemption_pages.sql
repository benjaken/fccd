create or replace function public.customer_portal_ops_redemption_page(p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_total bigint; v_page integer;
begin
  perform private.customer_portal_ops_require(false);
  select count(*) into v_total from customer_reward_catalog_redemptions;
  v_page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(v_total/15.0)::integer));
  return jsonb_build_object('total',v_total,'page',v_page,'rows',coalesce((
    select jsonb_agg(row_data order by priority,created_at desc,id desc) from (
      select r.id,r.created_at,case when r.status='pending' then 0 else 1 end priority,
        jsonb_build_object('id',r.id,'name',c.name,'kind',c.kind,'points',r.points,'status',r.status,
          'account',coalesce(o.name,u.email),'created_at',r.created_at,'voucher_status',v.status,'voucher_last4',right(v.code,4)) row_data
      from customer_reward_catalog_redemptions r join customer_reward_catalog c on c.id=r.catalog_id
      left join customer_organizations o on o.id=r.organization_id left join auth.users u on u.id=r.user_id
      left join private.customer_shopify_vouchers v on v.redemption_id=r.id
      order by priority,r.created_at desc,r.id desc limit 15 offset (v_page-1)*15
    ) page_rows),'[]'::jsonb));
end $$;
revoke all on function public.customer_portal_ops_redemption_page(integer) from public,anon;
grant execute on function public.customer_portal_ops_redemption_page(integer) to authenticated;
