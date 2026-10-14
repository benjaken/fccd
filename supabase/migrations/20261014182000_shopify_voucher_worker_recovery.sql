-- Recover abandoned claims without changing their durable discount code.
alter table private.customer_shopify_vouchers add column if not exists locked_at timestamptz;
create or replace function public.shopify_claim_voucher_jobs(p_user_id uuid default null, p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_rows jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'invalid_limit'; end if;
  update private.customer_shopify_vouchers set status=case when attempt_count>=5 then 'failed' else 'queued' end,
    last_error='worker_lease_expired',locked_at=null
    where status='issuing' and (locked_at is null or locked_at<now()-interval '10 minutes');
  with picked as (
    select v.id from private.customer_shopify_vouchers v
    join customer_reward_catalog_redemptions r on r.id = v.redemption_id
    where v.status = 'queued'
      and (p_user_id is null or r.user_id = p_user_id or r.organization_id in (
        select organization_id from customer_memberships where user_id = p_user_id and is_active))
    order by v.created_at
    limit p_limit
    for update of v skip locked
  ), claimed as (
    update private.customer_shopify_vouchers v
      set status = 'issuing', locked_at=now(), attempt_count = v.attempt_count + 1, last_error = null
      from picked where v.id = picked.id
      returning v.id, v.redemption_id, v.store_id, v.amount, v.code, v.ends_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'code', c.code, 'amount', c.amount, 'ends_at', c.ends_at,
    'title', left(cat.name, 80), 'store_id', st.id, 'shop_domain', st.shop_domain, 'secret_prefix', st.secret_prefix,
    'customer_gid', i.shopify_customer_gid
  )), '[]') into v_rows
  from claimed c
  join customer_reward_catalog_redemptions r on r.id = c.redemption_id
  join customer_reward_catalog cat on cat.id = r.catalog_id
  join shopify_stores st on st.id = c.store_id
  left join private.customer_shopify_identities i on i.store_id = c.store_id
    and i.owner_id = coalesce(r.user_id, r.organization_id)
    and i.owner_type = case when r.user_id is null then 'organization' else 'user' end;
  return v_rows;
end $$;
