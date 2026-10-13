-- Personal accounts remain separate from organization rewards and memberships.
create function private.customer_personal_user()
returns uuid language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_id is null then raise exception 'email_verification_required' using errcode='42501'; end if;
  return v_id;
end $$;
revoke all on function private.customer_personal_user() from public,anon,authenticated;

create function private.customer_personal_owns_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $$
  select exists(select 1 from orders o where o.id=p_order_id and o.document_type='order' and o.archived_at is null and (
    exists(select 1 from private.customer_personal_order_links l where l.order_id=o.id and l.user_id=private.customer_personal_user())
    or exists(select 1 from private.customer_self_service_sessions s where s.auth_user_id=private.customer_personal_user()
      and s.expires_at>now() and private.self_service_order_matches(o,s.phone_hash,s.email_hash))))
$$;
revoke all on function private.customer_personal_owns_order(uuid) from public,anon,authenticated;

create table private.customer_personal_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check(length(name)<=120),
  phone text not null default '' check(length(phone)<=40),
  notify_email boolean not null default true,
  notify_whatsapp boolean not null default false,
  updated_at timestamptz not null default now()
);
create table private.customer_personal_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check(length(btrim(label)) between 1 and 80),
  recipient text not null check(length(btrim(recipient)) between 1 and 120),
  phone text not null check(length(btrim(phone)) between 1 and 40),
  address text not null check(length(btrim(address)) between 1 and 1000),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customer_personal_default_address on private.customer_personal_addresses(user_id) where is_default;
alter table private.customer_personal_profiles enable row level security;
alter table private.customer_personal_addresses enable row level security;
revoke all on private.customer_personal_profiles,private.customer_personal_addresses from public,anon,authenticated;
grant all on private.customer_personal_profiles,private.customer_personal_addresses to service_role;

create function public.customer_personal_save_profile(p_profile jsonb)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user();
begin
  if jsonb_typeof(p_profile) is distinct from 'object' or p_profile->>'name' is null or p_profile->>'phone' is null
    or jsonb_typeof(p_profile->'notify_email') is distinct from 'boolean'
    or jsonb_typeof(p_profile->'notify_whatsapp') is distinct from 'boolean' then raise exception 'invalid_profile'; end if;
  insert into private.customer_personal_profiles(user_id,name,phone,notify_email,notify_whatsapp)
    values(v_uid,btrim(p_profile->>'name'),btrim(p_profile->>'phone'),(p_profile->>'notify_email')::boolean,(p_profile->>'notify_whatsapp')::boolean)
    on conflict(user_id) do update set name=excluded.name,phone=excluded.phone,notify_email=excluded.notify_email,
      notify_whatsapp=excluded.notify_whatsapp,updated_at=now();
end $$;

create function public.customer_personal_save_address(p_id uuid,p_address jsonb)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user(); v_id uuid:=coalesce(p_id,gen_random_uuid()); v_default boolean;
begin
  if jsonb_typeof(p_address) is distinct from 'object' or jsonb_typeof(p_address->'is_default') is distinct from 'boolean'
    then raise exception 'invalid_address'; end if;
  perform 1 from auth.users where id=v_uid for update;
  if p_id is not null and not exists(select 1 from private.customer_personal_addresses where id=p_id and user_id=v_uid)
    then raise exception 'address_not_found' using errcode='42501'; end if;
  v_default:=(p_address->>'is_default')::boolean or not exists(select 1 from private.customer_personal_addresses where user_id=v_uid);
  if v_default then update private.customer_personal_addresses set is_default=false where user_id=v_uid and is_default; end if;
  insert into private.customer_personal_addresses(id,user_id,label,recipient,phone,address,is_default)
    values(v_id,v_uid,btrim(p_address->>'label'),btrim(p_address->>'recipient'),btrim(p_address->>'phone'),btrim(p_address->>'address'),v_default)
    on conflict(id) do update set label=excluded.label,recipient=excluded.recipient,phone=excluded.phone,address=excluded.address,
      is_default=excluded.is_default,updated_at=now();
  -- Unchecking the current default still leaves one default address.
  if not exists(select 1 from private.customer_personal_addresses where user_id=v_uid and is_default) then
    update private.customer_personal_addresses set is_default=true where id=(select id from private.customer_personal_addresses
      where user_id=v_uid order by created_at,id limit 1);
  end if;
  return v_id;
end $$;

create function public.customer_personal_delete_address(p_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user();
begin
  perform 1 from auth.users where id=v_uid for update;
  delete from private.customer_personal_addresses where id=p_id and user_id=v_uid;
  if not found then raise exception 'address_not_found' using errcode='42501'; end if;
  if not exists(select 1 from private.customer_personal_addresses where user_id=v_uid and is_default) then
    update private.customer_personal_addresses set is_default=true where id=(select id from private.customer_personal_addresses
      where user_id=v_uid order by created_at,id limit 1);
  end if;
end $$;

alter table customer_payment_evidence alter column organization_id drop not null;

-- Permissive Storage policies are OR-ed; an organization predicate must return
-- false for personal-only accounts rather than abort the entire policy evaluation.
create or replace function private.customer_receipt_path_allowed(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid; v_parts text[]:=string_to_array(p_path,'/');
begin
  v_org:=private.customer_organization();
  return array_length(v_parts,1)=3 and v_parts[1]=auth.uid()::text and exists(
    select 1 from customer_portal_orders where organization_id=v_org and order_id::text=v_parts[2]);
exception when insufficient_privilege then return false;
end $$;

-- A durable queue dedicated to evidence, independent of order-confirmation emails.
create table public.customer_personal_evidence_email_outbox (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references customer_payment_evidence(id),
  recipient text not null,
  order_number text not null,
  amount numeric(14,2) not null,
  status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  unique(evidence_id,recipient)
);
alter table customer_personal_evidence_email_outbox enable row level security;
create index customer_personal_evidence_email_pending on customer_personal_evidence_email_outbox(next_attempt_at) where status in ('pending','processing');
revoke all on customer_personal_evidence_email_outbox from public,anon,authenticated;
grant all on customer_personal_evidence_email_outbox to service_role;

create function private.customer_personal_evidence_path(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user(); v_parts text[]:=string_to_array(p_path,'/');
begin
  if array_length(v_parts,1) is distinct from 3 or v_parts[1] is distinct from v_uid::text
    or v_parts[2] !~ '^[0-9a-fA-F-]{36}$' or v_parts[3] !~ '^[0-9a-fA-F-]{36}\.(jpg|png|pdf)$' then return false; end if;
  return private.customer_personal_owns_order(v_parts[2]::uuid);
exception when invalid_text_representation then return false;
end $$;
revoke all on function private.customer_personal_evidence_path(text) from public,anon;
grant execute on function private.customer_personal_evidence_path(text) to authenticated;
create policy "Personal payment evidence uploads" on storage.objects for insert to authenticated
  with check(bucket_id='customer-payment-evidence' and private.customer_personal_evidence_path(name));
create policy "Personal payment evidence reads" on storage.objects for select to authenticated
  using(bucket_id='customer-payment-evidence' and private.customer_personal_evidence_path(name));

create function public.customer_personal_submit_evidence(p_order_id uuid,p_path text,p_amount numeric)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user(); v_id uuid; v_order orders%rowtype;
begin
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'invalid_payment_amount'; end if;
  if not private.customer_personal_evidence_path(p_path) or split_part(p_path,'/',2) is distinct from p_order_id::text
    then raise exception 'evidence_access_required' using errcode='42501'; end if;
  select * into v_order from orders where id=p_order_id for update;
  if v_order.currency is distinct from 'HKD' then raise exception 'unsupported_payment_currency'; end if;
  if not exists(select 1 from storage.objects where bucket_id='customer-payment-evidence' and name=p_path)
    then raise exception 'evidence_file_missing'; end if;
  -- An exact retry is safe, including when the order has since been paid.
  if exists(select 1 from customer_payment_evidence where object_path=p_path and created_by=v_uid and organization_id is null) then return; end if;
  if coalesce(v_order.outstanding,0)<=0 or p_amount>v_order.outstanding then raise exception 'invalid_payment_amount'; end if;
  insert into customer_payment_evidence(order_id,organization_id,created_by,object_path,amount)
    values(p_order_id,null,v_uid,p_path,p_amount) returning id into v_id;
  insert into customer_personal_evidence_email_outbox(evidence_id,recipient,order_number,amount)
    select v_id,lower(btrim(email)),coalesce(v_order.order_number,v_order.id::text),p_amount from user_profiles
    where role in ('Super Admin','Admin','Accounting') and email_noti and nullif(btrim(email),'') is not null
    on conflict(evidence_id,recipient) do nothing;
end $$;

create function public.customer_personal_snapshot()
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
    'order_states',coalesce((select jsonb_object_agg(o.id::text,jsonb_build_object('delivery_status',o.delivery_status,'paid',o.outstanding is not null and o.outstanding<=0))
      from orders o where private.customer_personal_owns_order(o.id)),'{}'),
    'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',id,'order_id',order_id,'amount',amount,'status',status,'review_reason',review_reason,'created_at',created_at)
      order by created_at desc) from customer_payment_evidence where created_by=v_uid and organization_id is null),'[]')
  );
end $$;

-- Only simple, uniquely mapped product variants can be replayed. Never silently lose package choices.
create function public.customer_personal_reorder(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_order orders%rowtype; v_line order_lines%rowtype; v_store shopify_stores%rowtype;
  v_variants text[]; v_items jsonb:='[]';
begin
  if not private.customer_personal_owns_order(p_order_id) then raise exception 'order_access_required' using errcode='42501'; end if;
  select * into v_order from orders where id=p_order_id;
  if (select count(*) from shopify_stores where channel_id=v_order.channel_id and is_active)<>1 then raise exception 'reorder_unavailable'; end if;
  select * into v_store from shopify_stores where channel_id=v_order.channel_id and is_active;
  if v_store.shop_domain !~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$' then raise exception 'reorder_unavailable'; end if;
  for v_line in select * from order_lines where order_id=p_order_id and not is_void order by item_order,id loop
    if v_line.package_id is not null or v_line.product_id is null or coalesce(v_line.quantity,0)<=0
      or v_line.quantity<>trunc(v_line.quantity) or v_line.quantity>10000
      or nullif(btrim(v_line.remarks_1),'') is not null or nullif(btrim(v_line.remarks_2),'') is not null then raise exception 'reorder_options_required'; end if;
    select array_agg(distinct m.shopify_variant_id::text) into v_variants from shopify_catalog_mappings m
      join shopify_catalog_drafts d on d.store_id=m.store_id and d.shopify_product_id=m.shopify_product_id
      join shopify_catalog_draft_variants v on v.draft_id=d.id and v.shopify_variant_id=m.shopify_variant_id
      where m.store_id=v_store.id and m.internal_product_id=v_line.product_id and m.resource_type='product_variant'
        and d.shopify_status='active' and d.approval_status='approved' and d.catalog_type='product' and not v.requires_components;
    if coalesce(array_length(v_variants,1),0)<>1 then raise exception 'reorder_unavailable'; end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object('variant',v_variants[1],'quantity',v_line.quantity::integer));
  end loop;
  if jsonb_array_length(v_items)=0 then raise exception 'reorder_unavailable'; end if;
  select jsonb_agg(jsonb_build_object('variant',variant,'quantity',quantity) order by variant) into v_items
    from (select value->>'variant' variant,sum((value->>'quantity')::integer) quantity
      from jsonb_array_elements(v_items) group by value->>'variant') grouped;
  if exists(select 1 from jsonb_array_elements(v_items) where (value->>'quantity')::bigint>10000) then raise exception 'reorder_unavailable'; end if;
  return jsonb_build_object('domain',v_store.shop_domain,'items',v_items);
end $$;

-- The existing finance action handles both organization and personal evidence.
create or replace function public.customer_portal_review_queue()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  if not private.customer_portal_is_finance() then raise exception 'finance_access_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'methods',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from payment_methods where is_active and archived_at is null),'[]'),
    'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'order_number',o.order_number,'organization',coalesce(g.name,u.email),
      'amount',e.amount,'created_at',e.created_at,'object_path',e.object_path)) from customer_payment_evidence e
      join orders o on o.id=e.order_id left join customer_organizations g on g.id=e.organization_id join auth.users u on u.id=e.created_by
      where e.status='pending'),'[]'));
end $$;

create function public.claim_customer_personal_evidence_emails(p_limit integer default 20)
returns setof customer_personal_evidence_email_outbox language sql security definer set search_path=public,pg_temp as $$
  update customer_personal_evidence_email_outbox set status='processing',attempts=attempts+1,locked_at=now()
    where id in (select id from customer_personal_evidence_email_outbox where attempts<5 and
      ((status='pending' and next_attempt_at<=now()) or (status='processing' and locked_at<now()-interval '10 minutes'))
      order by next_attempt_at for update skip locked limit greatest(1,least(p_limit,100))) returning *
$$;
revoke all on function public.claim_customer_personal_evidence_emails(integer) from public,anon,authenticated;
grant execute on function public.claim_customer_personal_evidence_emails(integer) to service_role;

revoke all on function public.customer_personal_snapshot(),public.customer_personal_save_profile(jsonb),
  public.customer_personal_save_address(uuid,jsonb),public.customer_personal_delete_address(uuid),
  public.customer_personal_submit_evidence(uuid,text,numeric),public.customer_personal_reorder(uuid) from public,anon;
grant execute on function public.customer_personal_snapshot(),public.customer_personal_save_profile(jsonb),
  public.customer_personal_save_address(uuid,jsonb),public.customer_personal_delete_address(uuid),
  public.customer_personal_submit_evidence(uuid,text,numeric),public.customer_personal_reorder(uuid) to authenticated;
