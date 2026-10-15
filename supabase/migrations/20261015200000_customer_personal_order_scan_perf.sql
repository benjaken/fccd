-- Personal order history must not test ownership by scanning the whole orders
-- table one row at a time. The two indexed sources are the explicit
-- personal-order links and the verified email, so we gather that candidate set
-- first and only then apply the existing per-order guards.

create or replace function private.customer_personal_owned_order_ids(p_uid uuid, p_email_normalized text)
returns setof uuid language sql stable security definer set search_path=public,private,pg_temp as $$
  select l.order_id from private.customer_personal_order_links l where l.user_id = p_uid
  union
  select o.id from public.orders o
    where o.document_type = 'order'
      and o.archived_at is null
      and p_email_normalized <> ''
      and lower(btrim(o.email_snapshot)) = p_email_normalized
$$;
revoke all on function private.customer_personal_owned_order_ids(uuid,text) from public, anon, authenticated;

create or replace function public.customer_personal_session()
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_user auth.users%rowtype;
  v_session private.customer_self_service_sessions%rowtype;
  v_email text;
begin
  select * into v_user from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_user.id is null then
    raise exception 'email_verification_required' using errcode = '42501';
  end if;
  perform 1 from auth.users where id = v_user.id for update;
  select * into v_session from private.customer_self_service_sessions
    where auth_user_id = v_user.id and expires_at > now()
    order by created_at desc
    limit 1;
  if v_session.token is null then
    insert into private.customer_self_service_sessions(phone_hash, email_hash, auth_user_id)
    values (
      extensions.digest('personal-phone:' || gen_random_uuid(), 'sha256'),
      extensions.digest('personal-email:' || gen_random_uuid(), 'sha256'),
      v_user.id
    )
    returning * into v_session;
  end if;
  v_email := lower(btrim(coalesce(v_user.email, '')));
  return jsonb_build_object(
    'token', v_session.token,
    'expiresAt', v_session.expires_at,
    'maskedPhone', '',
    'maskedEmail', private.self_service_mask_email(v_user.email),
    'needsPhone', false,
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'orderNumber', o.order_number,
        'orderDate', coalesce(o.bubble_created_at, o.created_at),
        'deliveryDate', o.delivery_at,
        'grandTotal', o.grand_total,
        'currency', o.currency
      ) order by coalesce(o.delivery_at, o.created_at) desc)
      from public.orders o
      where o.id in (select private.customer_personal_owned_order_ids(v_user.id, v_email))
        and o.document_type = 'order'
        and o.archived_at is null
        and private.customer_order_is_personal(o.id)
        and (
          exists (
            select 1 from private.customer_personal_order_links l
            where l.order_id = o.id and l.user_id = v_user.id
          )
          or private.personal_email_matches_order(o, v_user.email)
        )
    ), '[]'::jsonb)
  );
end
$$;
revoke all on function public.customer_personal_session() from public, anon;
grant execute on function public.customer_personal_session() to authenticated;

create or replace function public.customer_personal_snapshot()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare
  v_uid uuid:=private.customer_personal_user();
  v_email text;
begin
  v_email:=lower(btrim(coalesce((select email from auth.users where id=v_uid),'')));
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
      from orders o
      where o.id in (select private.customer_personal_owned_order_ids(v_uid,v_email))
        and private.customer_personal_owns_order(o.id)),'{}'),
    'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',id,'order_id',order_id,'amount',amount,'status',status,'review_reason',review_reason,'created_at',created_at)
      order by created_at desc) from customer_payment_evidence where created_by=v_uid and organization_id is null),'[]')
  );
end $$;
revoke all on function public.customer_personal_snapshot() from public, anon;
grant execute on function public.customer_personal_snapshot() to authenticated;
