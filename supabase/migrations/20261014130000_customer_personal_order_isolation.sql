-- Corporate orders remain corporate even when their contact email matches a personal account.
create or replace function private.customer_order_is_personal(p_order_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select not exists(select 1 from customer_portal_orders where order_id=p_order_id)
$$;
revoke all on function private.customer_order_is_personal(uuid) from public,anon,authenticated;

create or replace function private.personal_email_matches_order(p_order public.orders, p_email text)
returns boolean language sql stable set search_path=public,private as $$
  select nullif(btrim(coalesce(p_email,'')), '') is not null
    and not private.personal_email_is_internal(p_email)
    and private.customer_order_is_personal(p_order.id)
    and lower(btrim(coalesce(p_order.email_snapshot,'')))=lower(btrim(p_email))
$$;
revoke all on function private.personal_email_matches_order(public.orders,text) from public,anon,authenticated;

create or replace function private.customer_personal_owns_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $$
  select exists(select 1 from orders o where o.id=p_order_id and o.document_type='order' and o.archived_at is null
    and private.customer_order_is_personal(o.id) and (
      exists(select 1 from private.customer_personal_order_links l where l.order_id=o.id and l.user_id=private.customer_personal_user())
      or exists(select 1 from private.customer_self_service_sessions s where s.auth_user_id=private.customer_personal_user()
        and s.expires_at>now() and private.self_service_order_matches(o,s.phone_hash,s.email_hash))))
$$;
revoke all on function private.customer_personal_owns_order(uuid) from public,anon,authenticated;

create or replace function private.self_service_order_matches(p_order public.orders, p_phone_hash bytea, p_email_hash bytea)
returns boolean
language plpgsql
stable
set search_path = public, private, extensions
as $$
declare
  v_user uuid;
  v_email text;
begin
  select s.auth_user_id, u.email
    into v_user, v_email
  from private.customer_self_service_sessions s
  left join auth.users u on u.id = s.auth_user_id and u.email_confirmed_at is not null
  where s.phone_hash = p_phone_hash and s.email_hash = p_email_hash and s.auth_user_id is not null
  limit 1;
  if v_user is not null then
    if not private.customer_order_is_personal(p_order.id) then return false; end if;
    return exists (
      select 1 from private.customer_personal_order_links l
      join auth.users u on u.id = l.user_id
      where l.order_id = p_order.id and l.user_id = v_user and u.email_confirmed_at is not null
    ) or private.personal_email_matches_order(p_order, v_email);
  end if;
  return extensions.digest(lower(btrim(coalesce(p_order.email_snapshot, ''))), 'sha256') = p_email_hash and (
    extensions.digest(private.self_service_phone(p_order.contact_number_a_snapshot), 'sha256') = p_phone_hash or
    extensions.digest(private.self_service_phone(p_order.contact_number_b_snapshot), 'sha256') = p_phone_hash
  );
end
$$;
revoke all on function private.self_service_order_matches(public.orders, bytea, bytea) from public, anon, authenticated;

create or replace function public.customer_personal_session()
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_user auth.users%rowtype;
  v_session private.customer_self_service_sessions%rowtype;
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
      where o.document_type = 'order'
        and private.customer_order_is_personal(o.id)
        and o.archived_at is null
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
