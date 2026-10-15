-- Redemption records for the customer portal: goods and cash vouchers together.
-- A voucher row linked to a Shopify store carries the discount-code status and code;
-- goods and manually fulfilled vouchers carry only the redemption fulfilment status.

create or replace function private.reward_redemptions_for(p_user_id uuid, p_organization_id uuid)
returns jsonb language sql stable security definer set search_path=public,private,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', c.name, 'kind', c.kind, 'points', r.points,
    'status', r.status, 'created_at', r.created_at,
    'voucher_status', v.status,
    'voucher_code', case when v.status = 'issued' then v.code else null end,
    'voucher_amount', v.amount, 'shop_domain', s.shop_domain
  ) order by r.created_at desc), '[]')
  from customer_reward_catalog_redemptions r
  join customer_reward_catalog c on c.id = r.catalog_id
  left join private.customer_shopify_vouchers v on v.redemption_id = r.id
  left join shopify_stores s on s.id = v.store_id
  where (p_user_id is not null and r.user_id = p_user_id)
    or (p_organization_id is not null and r.organization_id = p_organization_id)
$$;

create or replace function public.customer_personal_reward_redemptions()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  return private.reward_redemptions_for(private.customer_personal_user(), null);
end $$;

create or replace function public.customer_portal_reward_redemptions()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  return private.reward_redemptions_for(null, private.customer_organization());
end $$;

revoke all on function public.customer_personal_reward_redemptions(), public.customer_portal_reward_redemptions() from public, anon;
grant execute on function public.customer_personal_reward_redemptions(), public.customer_portal_reward_redemptions() to authenticated;
