-- Personal order history "order again" opens the trusted brand website only.
-- The destination is resolved on the server from the order's configured active
-- Shopify store. No cart, quote, payment data or Shopify SSO is created, and an
-- unconfigured or ambiguous brand never falls back to another store.
create function private.customer_personal_order_store_domain(p_order_id uuid)
returns text language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_order orders%rowtype; v_domain text; v_count integer;
begin
  select * into v_order from orders where id=p_order_id;
  if v_order.id is null then return null; end if;
  if v_order.shopify_store_id is not null then
    select s.shop_domain into v_domain from shopify_stores s
      where s.id=v_order.shopify_store_id and s.is_active
        and s.shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$';
  end if;
  -- Portal orders carry a channel but no explicit store: only an unambiguous,
  -- active store for that channel is trusted.
  if v_domain is null and v_order.channel_id is not null then
    select count(*),(array_agg(s.shop_domain order by s.shop_domain))[1] into v_count,v_domain
      from shopify_stores s where s.channel_id=v_order.channel_id and s.is_active
        and s.shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$';
    if v_count is distinct from 1 then v_domain:=null; end if;
  end if;
  return v_domain;
end $$;
revoke all on function private.customer_personal_order_store_domain(uuid) from public,anon,authenticated;

create or replace function public.customer_personal_snapshot()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user();
begin
  return jsonb_build_object(
    'profile',jsonb_build_object('name',coalesce((select name from private.customer_personal_profiles where user_id=v_uid),''),
      'phone',coalesce((select phone from private.customer_personal_profiles where user_id=v_uid),''),
      'email',(select email from auth.users where id=v_uid),
      'notify_email',coalesce((select notify_email from private.customer_personal_profiles where user_id=v_uid),true),
      'notify_whatsapp',coalesce((select notify_whatsapp from private.customer_personal_profiles where user_id=v_uid),false)),
    'addresses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'recipient',recipient,'phone',phone,'address',address,'is_default',is_default)
      order by is_default desc,created_at) from private.customer_personal_addresses where user_id=v_uid),'[]'),
    'stores',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',coalesce(c.name,s.shop_domain),'domain',s.shop_domain) order by c.name,s.shop_domain)
      from shopify_stores s left join channels c on c.id=s.channel_id where s.is_active and s.shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),'[]'),
    'order_states',coalesce((select jsonb_object_agg(o.id::text,jsonb_build_object(
        'delivery_status',o.delivery_status,
        'paid',o.outstanding is not null and o.outstanding<=0,
        'store_domain',private.customer_personal_order_store_domain(o.id)))
      from orders o where private.customer_personal_owns_order(o.id)),'{}'),
    'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',id,'order_id',order_id,'amount',amount,'status',status,'review_reason',review_reason,'created_at',created_at)
      order by created_at desc) from customer_payment_evidence where created_by=v_uid and organization_id is null),'[]')
  );
end $$;
