-- OTP identities are immutable Auth user IDs. Historical orders require trusted reconciliation.
-- No contact lookup token or matching email/company name can create these links.
create table private.customer_personal_order_links (
  order_id uuid primary key references public.orders(id),
  user_id uuid not null references auth.users(id),
  linked_by uuid not null references auth.users(id),
  linked_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) > 0)
);
create index customer_personal_order_links_user_idx on private.customer_personal_order_links(user_id);
alter table private.customer_personal_order_links enable row level security;
revoke all on private.customer_personal_order_links from public, anon, authenticated;
grant all on private.customer_personal_order_links to service_role;

alter table private.customer_self_service_sessions add column auth_user_id uuid references auth.users(id) on delete cascade;
create index customer_self_service_auth_idx on private.customer_self_service_sessions(auth_user_id);

-- Existing detail/receipt/add-on RPCs continue to use the same parent-order guard.
-- A personal OTP capability is scoped to trusted links, never to contact hashes.
create or replace function private.self_service_order_matches(p_order public.orders,p_phone_hash bytea,p_email_hash bytea)
returns boolean language plpgsql stable set search_path=public,private,extensions as $$
declare v_user uuid;
begin
  select auth_user_id into v_user from private.customer_self_service_sessions
    where phone_hash=p_phone_hash and email_hash=p_email_hash and auth_user_id is not null limit 1;
  if v_user is not null then
    return exists(select 1 from private.customer_personal_order_links l join auth.users u on u.id=l.user_id
      where l.order_id=p_order.id and l.user_id=v_user and u.email_confirmed_at is not null);
  end if;
  return extensions.digest(lower(btrim(coalesce(p_order.email_snapshot,''))),'sha256')=p_email_hash and (
    extensions.digest(private.self_service_phone(p_order.contact_number_a_snapshot),'sha256')=p_phone_hash or
    extensions.digest(private.self_service_phone(p_order.contact_number_b_snapshot),'sha256')=p_phone_hash
  );
end $$;
revoke all on function private.self_service_order_matches(public.orders,bytea,bytea) from public,anon,authenticated;

create or replace function public.customer_personal_session()
returns jsonb language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare v_user auth.users%rowtype; v_session private.customer_self_service_sessions%rowtype;
begin
  select * into v_user from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_user.id is null then raise exception 'email_verification_required' using errcode='42501'; end if;
  -- Serialize issuance so concurrent refreshes reuse the same live capability.
  perform 1 from auth.users where id=v_user.id for update;
  select * into v_session from private.customer_self_service_sessions
    where auth_user_id=v_user.id and expires_at>now() order by created_at desc limit 1;
  if v_session.token is null then
    insert into private.customer_self_service_sessions(phone_hash,email_hash,auth_user_id)
      values(extensions.digest('personal-phone:'||gen_random_uuid(),'sha256'),
        extensions.digest('personal-email:'||gen_random_uuid(),'sha256'),v_user.id) returning * into v_session;
  end if;
  return jsonb_build_object('token',v_session.token,'expiresAt',v_session.expires_at,
    'maskedPhone','','maskedEmail',private.self_service_mask_email(v_user.email),
    'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'orderNumber',o.order_number,
      'orderDate',coalesce(o.bubble_created_at,o.created_at),'deliveryDate',o.delivery_at,
      'grandTotal',o.grand_total,'currency',o.currency) order by coalesce(o.delivery_at,o.created_at) desc)
      from private.customer_personal_order_links l join public.orders o on o.id=l.order_id
      where l.user_id=v_user.id and o.document_type='order' and o.archived_at is null),'[]'::jsonb));
end $$;
revoke all on function public.customer_personal_session() from public,anon;
grant execute on function public.customer_personal_session() to authenticated;

create or replace function public.customer_personal_logout()
returns void language sql security definer set search_path=private,pg_temp as $$
  delete from private.customer_self_service_sessions where auth_user_id=auth.uid()
$$;
revoke all on function public.customer_personal_logout() from public,anon;
grant execute on function public.customer_personal_logout() to authenticated;
