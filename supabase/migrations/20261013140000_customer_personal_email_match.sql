-- A verified customer email claims that mailbox's historical orders. Phone is not required.
-- Company inboxes are not customer identities, so they never auto-claim orders.

create or replace function private.personal_email_is_internal(p_email text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(btrim(coalesce(p_email, ''))) = 'foodchannels.plan@gmail.com'
    or split_part(lower(btrim(coalesce(p_email, ''))), '@', 2) in (
      'foodchannels-catering.com',
      'foodchannels.catering.com',
      'foodchannels-kitchen.com',
      'foodchannels-cuisine.com',
      'hklunchbox.com',
      'hkpartyfood.com'
    )
$$;
revoke all on function private.personal_email_is_internal(text) from public, anon, authenticated;

create or replace function private.personal_email_matches_order(p_order public.orders, p_email text)
returns boolean
language sql
stable
set search_path = public, private
as $$
  select nullif(btrim(coalesce(p_email, '')), '') is not null
    and not private.personal_email_is_internal(p_email)
    and lower(btrim(coalesce(p_order.email_snapshot, ''))) = lower(btrim(p_email))
$$;
revoke all on function private.personal_email_matches_order(public.orders, text) from public, anon, authenticated;

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
