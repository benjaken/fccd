-- Shopify fixed-amount voucher codes and bidirectional customer address sync.
-- Points are still deducted by the existing catalog redemption. A voucher row is
-- queued only when the catalog item names a store and a face value. Address
-- jobs are queued only for owners already linked to a Shopify customer.

alter table public.customer_reward_catalog
  add column if not exists voucher_amount_hkd numeric(14,2) check (voucher_amount_hkd is null or voucher_amount_hkd > 0),
  add column if not exists shopify_store_id uuid references public.shopify_stores(id),
  add column if not exists voucher_valid_days integer not null default 365 check (voucher_valid_days between 1 and 3650);

alter table public.customer_reward_catalog
  drop constraint if exists customer_reward_catalog_shopify_voucher;
alter table public.customer_reward_catalog
  add constraint customer_reward_catalog_shopify_voucher check (
    (kind = 'gift' and voucher_amount_hkd is null and shopify_store_id is null)
    or (kind = 'voucher' and ((voucher_amount_hkd is null and shopify_store_id is null) or (voucher_amount_hkd is not null and shopify_store_id is not null)))
  );

create table if not exists private.customer_shopify_identities (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('user', 'organization')),
  owner_id uuid not null,
  store_id uuid not null references public.shopify_stores(id),
  shopify_customer_gid text not null check (shopify_customer_gid ~ '^gid://shopify/Customer/[0-9]+$'),
  created_at timestamptz not null default now(),
  unique (owner_type, owner_id, store_id),
  unique (store_id, shopify_customer_gid)
);

create table if not exists private.customer_shopify_vouchers (
  id uuid primary key default gen_random_uuid(),
  redemption_id uuid not null unique references public.customer_reward_catalog_redemptions(id),
  store_id uuid not null references public.shopify_stores(id),
  amount numeric(14,2) not null check (amount > 0),
  code text unique check (code is null or code ~ '^FCCD[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$'),
  shopify_discount_gid text,
  status text not null default 'queued' check (status in ('queued', 'issuing', 'issued', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  ends_at timestamptz not null,
  issued_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists private.customer_address_shopify_links (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('user', 'organization')),
  owner_id uuid not null,
  local_address_id uuid not null,
  store_id uuid not null references public.shopify_stores(id),
  shopify_address_gid text not null,
  synced_hash text not null,
  status text not null default 'synced' check (status in ('synced', 'conflict')),
  updated_at timestamptz not null default now(),
  unique (owner_type, local_address_id, store_id),
  unique (store_id, shopify_address_gid)
);

create table if not exists private.customer_address_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('user', 'organization')),
  owner_id uuid not null,
  local_address_id uuid not null,
  store_id uuid not null references public.shopify_stores(id),
  action text not null check (action in ('upsert', 'delete')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists customer_address_sync_outbox_open
  on private.customer_address_sync_outbox(local_address_id, store_id)
  where status in ('queued', 'processing');

alter table private.customer_shopify_identities enable row level security;
alter table private.customer_shopify_vouchers enable row level security;
alter table private.customer_address_shopify_links enable row level security;
alter table private.customer_address_sync_outbox enable row level security;
revoke all on private.customer_shopify_identities, private.customer_shopify_vouchers,
  private.customer_address_shopify_links, private.customer_address_sync_outbox
  from public, anon, authenticated;
grant all on private.customer_shopify_identities, private.customer_shopify_vouchers,
  private.customer_address_shopify_links, private.customer_address_sync_outbox to service_role;

create or replace function private.queue_shopify_voucher()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_item public.customer_reward_catalog%rowtype;
begin
  select * into v_item from public.customer_reward_catalog where id = new.catalog_id;
  if v_item.kind = 'voucher' and v_item.voucher_amount_hkd is not null and v_item.shopify_store_id is not null then
    insert into private.customer_shopify_vouchers(redemption_id, store_id, amount, ends_at)
    values (new.id, v_item.shopify_store_id, v_item.voucher_amount_hkd, now() + make_interval(days => v_item.voucher_valid_days))
    on conflict (redemption_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists customer_reward_redemptions_queue_shopify_voucher on public.customer_reward_catalog_redemptions;
create trigger customer_reward_redemptions_queue_shopify_voucher
  after insert on public.customer_reward_catalog_redemptions
  for each row execute function private.queue_shopify_voucher();

create or replace function private.enqueue_customer_address_sync(
  p_owner_type text, p_owner_id uuid, p_address_id uuid, p_action text
) returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_store uuid;
begin
  if p_owner_type not in ('user', 'organization') or p_action not in ('upsert', 'delete') then return; end if;
  for v_store in
    select store_id from private.customer_shopify_identities
    where owner_type = p_owner_type and owner_id = p_owner_id
  loop
    update private.customer_address_sync_outbox
      set action = p_action, status = 'queued', last_error = null, next_attempt_at = now()
      where local_address_id = p_address_id and store_id = v_store and status in ('queued', 'failed');
    if not found and not exists (
      select 1 from private.customer_address_sync_outbox
      where local_address_id = p_address_id and store_id = v_store and status = 'processing'
    ) then
      insert into private.customer_address_sync_outbox(owner_type, owner_id, local_address_id, store_id, action)
      values (p_owner_type, p_owner_id, p_address_id, v_store, p_action);
    end if;
  end loop;
end $$;

create or replace function public.customer_portal_save_address(p_label text, p_recipient text, p_phone text, p_address text)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_id uuid;
begin
  if length(btrim(p_label)) not between 1 and 80 or length(btrim(p_recipient)) not between 1 and 100
    or length(btrim(p_address)) not between 5 and 500 or p_phone !~ '^\+?[0-9 -]{8,20}$'
    or p_label is null or p_recipient is null or p_address is null or p_phone is null then
    raise exception 'invalid_address';
  end if;
  insert into customer_addresses(organization_id, label, recipient, phone, address, created_by)
  values (v_org, btrim(p_label), btrim(p_recipient), p_phone, btrim(p_address), auth.uid()) returning id into v_id;
  perform private.enqueue_customer_address_sync('organization', v_org, v_id, 'upsert');
  return v_id;
end $$;

create or replace function public.customer_portal_update_address(
  p_id uuid, p_label text, p_recipient text, p_phone text, p_address text
) returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
begin
  if p_id is null or length(btrim(p_label)) not between 1 and 80 or length(btrim(p_recipient)) not between 1 and 100
    or length(btrim(p_address)) not between 5 and 500 or p_phone !~ '^\+?[0-9 -]{8,20}$'
    or p_label is null or p_recipient is null or p_address is null or p_phone is null then
    raise exception 'invalid_address';
  end if;
  update customer_addresses
    set label = btrim(p_label), recipient = btrim(p_recipient), phone = p_phone, address = btrim(p_address)
    where id = p_id and organization_id = v_org and archived_at is null;
  if not found then raise exception 'address_required'; end if;
  perform private.enqueue_customer_address_sync('organization', v_org, p_id, 'upsert');
end $$;

create or replace function public.customer_portal_archive_address(p_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
begin
  if p_id is null then raise exception 'address_required'; end if;
  update customer_addresses set archived_at = now()
    where id = p_id and organization_id = v_org and archived_at is null;
  if not found then raise exception 'address_required'; end if;
  perform private.enqueue_customer_address_sync('organization', v_org, p_id, 'delete');
end $$;

create or replace function public.customer_personal_save_address(p_id uuid, p_address jsonb)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid := private.customer_personal_user(); v_id uuid := coalesce(p_id, gen_random_uuid()); v_default boolean;
begin
  if jsonb_typeof(p_address) is distinct from 'object' or jsonb_typeof(p_address->'is_default') is distinct from 'boolean'
    then raise exception 'invalid_address'; end if;
  perform 1 from auth.users where id = v_uid for update;
  if p_id is not null and not exists (select 1 from private.customer_personal_addresses where id = p_id and user_id = v_uid)
    then raise exception 'address_not_found' using errcode = '42501'; end if;
  v_default := (p_address->>'is_default')::boolean or not exists (select 1 from private.customer_personal_addresses where user_id = v_uid);
  if v_default then update private.customer_personal_addresses set is_default = false where user_id = v_uid and is_default; end if;
  insert into private.customer_personal_addresses(id, user_id, label, recipient, phone, address, is_default)
    values (v_id, v_uid, btrim(p_address->>'label'), btrim(p_address->>'recipient'), btrim(p_address->>'phone'), btrim(p_address->>'address'), v_default)
    on conflict (id) do update set label = excluded.label, recipient = excluded.recipient, phone = excluded.phone,
      address = excluded.address, is_default = excluded.is_default, updated_at = now();
  if not exists (select 1 from private.customer_personal_addresses where user_id = v_uid and is_default) then
    update private.customer_personal_addresses set is_default = true where id = (
      select id from private.customer_personal_addresses where user_id = v_uid order by created_at, id limit 1);
  end if;
  perform private.enqueue_customer_address_sync('user', v_uid, v_id, 'upsert');
  return v_id;
end $$;

create or replace function public.customer_personal_delete_address(p_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid := private.customer_personal_user();
begin
  perform 1 from auth.users where id = v_uid for update;
  if not exists (select 1 from private.customer_personal_addresses where id = p_id and user_id = v_uid) then
    raise exception 'address_not_found' using errcode = '42501';
  end if;
  perform private.enqueue_customer_address_sync('user', v_uid, p_id, 'delete');
  delete from private.customer_personal_addresses where id = p_id and user_id = v_uid;
  if not exists (select 1 from private.customer_personal_addresses where user_id = v_uid and is_default) then
    update private.customer_personal_addresses set is_default = true where id = (
      select id from private.customer_personal_addresses where user_id = v_uid order by created_at, id limit 1);
  end if;
end $$;

create or replace function public.customer_reward_catalog()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_personal_user();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'kind', kind, 'points_cost', points_cost, 'description', description, 'stock', stock,
    'voucher_amount_hkd', voucher_amount_hkd
  ) order by points_cost, name) from customer_reward_catalog where is_active), '[]');
end $$;

drop function if exists public.customer_portal_ops_upsert_reward_catalog(uuid, text, text, bigint, text, integer, boolean);
create function public.customer_portal_ops_upsert_reward_catalog(
  p_id uuid, p_name text, p_kind text, p_points bigint, p_description text, p_stock integer, p_active boolean,
  p_voucher_amount numeric default null, p_store_id uuid default null, p_valid_days integer default 365
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); v_name text := btrim(coalesce(p_name, ''));
  v_amount numeric(14,2) := p_voucher_amount; v_store uuid := p_store_id; v_days integer := coalesce(p_valid_days, 365);
begin
  perform private.customer_portal_ops_require(true);
  if p_kind = 'gift' then v_amount := null; v_store := null; end if;
  if v_name = '' or p_kind not in ('gift', 'voucher') or p_points is null or p_points < 1 or p_stock is null or p_stock < 0 or p_active is null
    or v_days < 1 or (p_kind = 'voucher' and ((v_amount is null) <> (v_store is null) or (v_amount is not null and v_amount <= 0))) then
    raise exception 'invalid_catalog_item' using errcode = 'P0001';
  end if;
  if v_store is not null and not exists (select 1 from shopify_stores where id = v_store and is_active) then
    raise exception 'invalid_catalog_item' using errcode = 'P0001';
  end if;
  insert into customer_reward_catalog(id, name, kind, points_cost, description, stock, is_active, voucher_amount_hkd, shopify_store_id, voucher_valid_days)
    values (v_id, v_name, p_kind, p_points, btrim(coalesce(p_description, '')), p_stock, p_active, v_amount, v_store, v_days)
  on conflict (id) do update set name = excluded.name, kind = excluded.kind, points_cost = excluded.points_cost,
    description = excluded.description, stock = excluded.stock, is_active = excluded.is_active,
    voucher_amount_hkd = excluded.voucher_amount_hkd, shopify_store_id = excluded.shopify_store_id,
    voucher_valid_days = excluded.voucher_valid_days;
  return v_id;
end $$;

create or replace function public.customer_portal_ops_list_reward_catalog()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'kind', kind, 'points_cost', points_cost, 'description', description, 'stock', stock,
    'is_active', is_active, 'voucher_amount_hkd', voucher_amount_hkd, 'shopify_store_id', shopify_store_id,
    'voucher_valid_days', voucher_valid_days
  ) order by is_active desc, points_cost, name) from customer_reward_catalog), '[]');
end $$;

create or replace function public.customer_portal_ops_list_reward_redemptions()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', c.name, 'kind', c.kind, 'points', r.points, 'status', r.status,
    'account', coalesce(o.name, u.email), 'created_at', r.created_at,
    'voucher_status', v.status, 'voucher_last4', right(v.code, 4)
  ) order by r.created_at desc) from (
    select * from customer_reward_catalog_redemptions order by created_at desc limit 100
  ) r
  join customer_reward_catalog c on c.id = r.catalog_id
  left join customer_organizations o on o.id = r.organization_id
  left join auth.users u on u.id = r.user_id
  left join private.customer_shopify_vouchers v on v.redemption_id = r.id), '[]');
end $$;

create or replace function public.customer_portal_ops_link_shopify_customer(
  p_owner_type text, p_owner_id uuid, p_store_id uuid, p_customer_id text
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_gid text; v_id uuid;
begin
  perform private.customer_portal_ops_require(true);
  v_gid := case
    when p_customer_id ~ '^[0-9]+$' then 'gid://shopify/Customer/' || p_customer_id
    when p_customer_id ~ '^gid://shopify/Customer/[0-9]+$' then p_customer_id
    else null end;
  if p_owner_type not in ('user', 'organization') or p_owner_id is null or v_gid is null
    or not exists (select 1 from shopify_stores where id = p_store_id and is_active) then
    raise exception 'invalid_shopify_customer' using errcode = 'P0001';
  end if;
  if p_owner_type = 'user' and not exists (select 1 from auth.users where id = p_owner_id) then
    raise exception 'invalid_shopify_customer' using errcode = 'P0001';
  end if;
  if p_owner_type = 'organization' and not exists (select 1 from customer_organizations where id = p_owner_id) then
    raise exception 'invalid_shopify_customer' using errcode = 'P0001';
  end if;
  insert into private.customer_shopify_identities(owner_type, owner_id, store_id, shopify_customer_gid)
    values (p_owner_type, p_owner_id, p_store_id, v_gid)
  on conflict (owner_type, owner_id, store_id) do update set shopify_customer_gid = excluded.shopify_customer_gid
  returning id into v_id;
  return v_id;
end $$;

create or replace function private.shopify_vouchers_for(p_user_id uuid, p_organization_id uuid)
returns jsonb language sql stable security definer set search_path=public,private,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'name', c.name, 'amount', v.amount, 'status', v.status, 'ends_at', v.ends_at,
    'code', case when v.status = 'issued' then v.code else null end,
    'shop_domain', s.shop_domain
  ) order by v.created_at desc), '[]')
  from private.customer_shopify_vouchers v
  join customer_reward_catalog_redemptions r on r.id = v.redemption_id
  join customer_reward_catalog c on c.id = r.catalog_id
  join shopify_stores s on s.id = v.store_id
  where (p_user_id is not null and r.user_id = p_user_id)
    or (p_organization_id is not null and r.organization_id = p_organization_id)
$$;

create or replace function public.customer_personal_shopify_vouchers()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  return private.shopify_vouchers_for(private.customer_personal_user(), null);
end $$;

create or replace function public.customer_portal_shopify_vouchers()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  return private.shopify_vouchers_for(null, private.customer_organization());
end $$;

create or replace function public.shopify_claim_voucher_jobs(p_user_id uuid default null, p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_rows jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'invalid_limit'; end if;
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
      set status = 'issuing', attempt_count = v.attempt_count + 1, last_error = null
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

create or replace function public.shopify_assign_voucher_code(p_id uuid, p_code text)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if p_code !~ '^FCCD[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$' then raise exception 'invalid_voucher_code'; end if;
  update private.customer_shopify_vouchers set code = p_code where id = p_id and status = 'issuing' and code is null;
  if not found and not exists (select 1 from private.customer_shopify_vouchers where id = p_id and code = p_code) then
    raise exception 'voucher_code_not_assigned';
  end if;
end $$;

create or replace function public.shopify_complete_voucher(p_id uuid, p_gid text, p_code text)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  update private.customer_shopify_vouchers
    set status = 'issued', shopify_discount_gid = p_gid, code = p_code, issued_at = now(), last_error = null
    where id = p_id and status = 'issuing';
  if not found then raise exception 'voucher_not_issuing'; end if;
end $$;

create or replace function public.shopify_fail_voucher(p_id uuid, p_error text)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  update private.customer_shopify_vouchers
    set status = case when attempt_count >= 8 then 'failed' else 'queued' end,
      last_error = left(coalesce(p_error, 'shopify_voucher_failed'), 500)
    where id = p_id and status = 'issuing';
end $$;

create or replace function public.shopify_actor_targets(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=public,private,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'owner_type', i.owner_type, 'owner_id', i.owner_id, 'store_id', i.store_id,
    'customer_gid', i.shopify_customer_gid, 'shop_domain', s.shop_domain, 'secret_prefix', s.secret_prefix
  )), '[]')
  from private.customer_shopify_identities i
  join shopify_stores s on s.id = i.store_id and s.is_active
  where (i.owner_type = 'user' and i.owner_id = p_user_id)
    or (i.owner_type = 'organization' and i.owner_id in (
      select organization_id from customer_memberships where user_id = p_user_id and is_active))
$$;

create or replace function public.shopify_identity_for_customer(p_store_id uuid, p_customer_gid text)
returns jsonb language sql stable security definer set search_path=public,private,pg_temp as $$
  select jsonb_build_object(
    'owner_type', i.owner_type, 'owner_id', i.owner_id, 'store_id', i.store_id,
    'customer_gid', i.shopify_customer_gid, 'shop_domain', s.shop_domain, 'secret_prefix', s.secret_prefix
  )
  from private.customer_shopify_identities i
  join shopify_stores s on s.id = i.store_id
  where i.store_id = p_store_id and i.shopify_customer_gid = p_customer_gid
$$;

create or replace function public.shopify_address_snapshot(p_owner_type text, p_owner_id uuid, p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_local jsonb; v_links jsonb;
begin
  if p_owner_type = 'user' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'recipient', recipient, 'phone', phone, 'address', address,
      'isDefault', is_default, 'archived', false
    )), '[]') into v_local from private.customer_personal_addresses where user_id = p_owner_id;
  elsif p_owner_type = 'organization' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'recipient', recipient, 'phone', phone, 'address', address,
      'isDefault', false, 'archived', archived_at is not null
    )), '[]') into v_local from customer_addresses where organization_id = p_owner_id;
  else
    raise exception 'invalid_owner';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'localId', local_address_id, 'remoteId', shopify_address_gid, 'syncedHash', synced_hash, 'status', status
  )), '[]') into v_links
  from private.customer_address_shopify_links
  where owner_type = p_owner_type and owner_id = p_owner_id and store_id = p_store_id;
  return jsonb_build_object('local', v_local, 'links', v_links);
end $$;

create or replace function public.shopify_apply_address_pull(
  p_owner_type text, p_owner_id uuid, p_store_id uuid, p_remote_id text, p_local_id uuid,
  p_recipient text, p_phone text, p_address text, p_is_default boolean, p_hash text, p_mode text
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid := p_local_id; v_actor uuid; v_phone text := btrim(coalesce(p_phone, ''));
  v_recipient text := btrim(coalesce(p_recipient, '')); v_address text := btrim(coalesce(p_address, ''));
begin
  if p_mode not in ('create', 'update', 'archive') or p_hash is null or p_remote_id is null then
    return jsonb_build_object('applied', false, 'reason', 'invalid_pull');
  end if;
  if p_mode = 'archive' then
    if p_owner_type = 'user' then
      delete from private.customer_personal_addresses where id = p_local_id and user_id = p_owner_id;
    else
      update customer_addresses set archived_at = coalesce(archived_at, now()) where id = p_local_id and organization_id = p_owner_id;
    end if;
    delete from private.customer_address_shopify_links
      where owner_type = p_owner_type and local_address_id = p_local_id and store_id = p_store_id;
    return jsonb_build_object('applied', true);
  end if;
  if length(v_recipient) not between 1 and 100 or length(v_address) not between 5 and 500 or v_phone !~ '^\+?[0-9 -]{8,20}$' then
    return jsonb_build_object('applied', false, 'reason', 'invalid_remote_address');
  end if;
  if p_owner_type = 'user' then
    if p_mode = 'create' then v_id := gen_random_uuid(); end if;
    if p_is_default then update private.customer_personal_addresses set is_default = false where user_id = p_owner_id and is_default; end if;
    insert into private.customer_personal_addresses(id, user_id, label, recipient, phone, address, is_default)
      values (v_id, p_owner_id, 'Shopify', v_recipient, v_phone, v_address, coalesce(p_is_default, false))
    on conflict (id) do update set recipient = excluded.recipient, phone = excluded.phone, address = excluded.address,
      is_default = excluded.is_default, updated_at = now()
      where private.customer_personal_addresses.user_id = p_owner_id;
  elsif p_owner_type = 'organization' then
    if p_mode = 'create' then
      select user_id into v_actor from customer_memberships
        where organization_id = p_owner_id and is_active
        order by case role when 'admin' then 0 else 1 end, created_at limit 1;
      if v_actor is null then return jsonb_build_object('applied', false, 'reason', 'organization_member_missing'); end if;
      v_id := gen_random_uuid();
      insert into customer_addresses(id, organization_id, label, recipient, phone, address, created_by)
        values (v_id, p_owner_id, 'Shopify', v_recipient, v_phone, v_address, v_actor);
    else
      update customer_addresses set recipient = v_recipient, phone = v_phone, address = v_address
        where id = p_local_id and organization_id = p_owner_id and archived_at is null;
      if not found then return jsonb_build_object('applied', false, 'reason', 'address_missing'); end if;
      v_id := p_local_id;
    end if;
  else
    return jsonb_build_object('applied', false, 'reason', 'invalid_owner');
  end if;
  insert into private.customer_address_shopify_links(owner_type, owner_id, local_address_id, store_id, shopify_address_gid, synced_hash, status)
    values (p_owner_type, p_owner_id, v_id, p_store_id, p_remote_id, p_hash, 'synced')
  on conflict (owner_type, local_address_id, store_id) do update
    set shopify_address_gid = excluded.shopify_address_gid, synced_hash = excluded.synced_hash, status = 'synced', updated_at = now();
  return jsonb_build_object('applied', true, 'local_id', v_id);
end $$;

create or replace function public.shopify_save_address_link(
  p_owner_type text, p_owner_id uuid, p_local_id uuid, p_store_id uuid, p_remote_id text, p_hash text
) returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  insert into private.customer_address_shopify_links(owner_type, owner_id, local_address_id, store_id, shopify_address_gid, synced_hash, status)
    values (p_owner_type, p_owner_id, p_local_id, p_store_id, p_remote_id, p_hash, 'synced')
  on conflict (owner_type, local_address_id, store_id) do update
    set shopify_address_gid = excluded.shopify_address_gid, synced_hash = excluded.synced_hash, status = 'synced', updated_at = now();
end $$;

create or replace function public.shopify_clear_address_link(p_owner_type text, p_local_id uuid, p_store_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  delete from private.customer_address_shopify_links
    where owner_type = p_owner_type and local_address_id = p_local_id and store_id = p_store_id;
end $$;

create or replace function public.shopify_mark_address_conflict(p_owner_type text, p_local_id uuid, p_store_id uuid, p_remote_id text)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  update private.customer_address_shopify_links set status = 'conflict', updated_at = now()
    where owner_type = p_owner_type and local_address_id = p_local_id and store_id = p_store_id and shopify_address_gid = p_remote_id;
end $$;

create or replace function public.shopify_claim_address_jobs(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_rows jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'invalid_limit'; end if;
  update private.customer_address_sync_outbox j
    set next_attempt_at = now() + interval '1 hour', last_error = 'shopify_customer_unlinked'
    where j.status = 'queued' and not exists (
      select 1 from private.customer_shopify_identities i
      where i.owner_type = j.owner_type and i.owner_id = j.owner_id and i.store_id = j.store_id
    );
  with picked as (
    select j.id from private.customer_address_sync_outbox j
    join private.customer_shopify_identities i
      on i.owner_type = j.owner_type and i.owner_id = j.owner_id and i.store_id = j.store_id
    where j.status = 'queued' and j.next_attempt_at <= now()
    order by j.created_at limit p_limit
    for update of j skip locked
  ), claimed as (
    update private.customer_address_sync_outbox j
      set status = 'processing', attempt_count = j.attempt_count + 1
      from picked where j.id = picked.id
      returning j.id, j.owner_type, j.owner_id, j.store_id
  )
  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'owner_type', c.owner_type, 'owner_id', c.owner_id, 'store_id', c.store_id,
    'customer_gid', i.shopify_customer_gid, 'shop_domain', s.shop_domain, 'secret_prefix', s.secret_prefix
  )), '[]') into v_rows
  from claimed c
  join shopify_stores s on s.id = c.store_id and s.is_active
  join private.customer_shopify_identities i
    on i.owner_type = c.owner_type and i.owner_id = c.owner_id and i.store_id = c.store_id;
  return v_rows;
end $$;

create or replace function public.shopify_finish_address_jobs(
  p_owner_type text, p_owner_id uuid, p_store_id uuid, p_error text
) returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if p_error is null then
    update private.customer_address_sync_outbox
      set status = 'done', last_error = null
      where owner_type = p_owner_type and owner_id = p_owner_id and store_id = p_store_id and status = 'processing';
  else
    update private.customer_address_sync_outbox
      set status = case when attempt_count >= 8 then 'failed' else 'queued' end,
        next_attempt_at = now() + interval '15 minutes',
        last_error = left(p_error, 500)
      where owner_type = p_owner_type and owner_id = p_owner_id and store_id = p_store_id and status = 'processing';
  end if;
end $$;

revoke all on function public.shopify_claim_voucher_jobs(uuid, integer), public.shopify_assign_voucher_code(uuid, text),
  public.shopify_complete_voucher(uuid, text, text), public.shopify_fail_voucher(uuid, text),
  public.shopify_actor_targets(uuid), public.shopify_identity_for_customer(uuid, text),
  public.shopify_address_snapshot(text, uuid, uuid),
  public.shopify_apply_address_pull(text, uuid, uuid, text, uuid, text, text, text, boolean, text, text),
  public.shopify_save_address_link(text, uuid, uuid, uuid, text, text), public.shopify_clear_address_link(text, uuid, uuid),
  public.shopify_mark_address_conflict(text, uuid, uuid, text), public.shopify_claim_address_jobs(integer),
  public.shopify_finish_address_jobs(text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.shopify_claim_voucher_jobs(uuid, integer), public.shopify_assign_voucher_code(uuid, text),
  public.shopify_complete_voucher(uuid, text, text), public.shopify_fail_voucher(uuid, text),
  public.shopify_actor_targets(uuid), public.shopify_identity_for_customer(uuid, text),
  public.shopify_address_snapshot(text, uuid, uuid),
  public.shopify_apply_address_pull(text, uuid, uuid, text, uuid, text, text, text, boolean, text, text),
  public.shopify_save_address_link(text, uuid, uuid, uuid, text, text), public.shopify_clear_address_link(text, uuid, uuid),
  public.shopify_mark_address_conflict(text, uuid, uuid, text), public.shopify_claim_address_jobs(integer),
  public.shopify_finish_address_jobs(text, uuid, uuid, text) to service_role;

grant execute on function public.customer_personal_shopify_vouchers(), public.customer_portal_shopify_vouchers(),
  public.customer_portal_ops_link_shopify_customer(text, uuid, uuid, text),
  public.customer_portal_ops_upsert_reward_catalog(uuid, text, text, bigint, text, integer, boolean, numeric, uuid, integer)
  to authenticated;
revoke all on function public.customer_personal_shopify_vouchers(), public.customer_portal_shopify_vouchers(),
  public.customer_portal_ops_link_shopify_customer(text, uuid, uuid, text),
  public.customer_portal_ops_upsert_reward_catalog(uuid, text, text, bigint, text, integer, boolean, numeric, uuid, integer)
  from public, anon;
