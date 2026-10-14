-- Points buy a catalog gift or cash voucher. They never reduce an order total.

create table if not exists public.customer_reward_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('gift','voucher')),
  points_cost bigint not null check (points_cost > 0),
  description text not null default '',
  stock integer not null check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.customer_reward_catalog_redemptions (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.customer_reward_catalog(id),
  user_id uuid references auth.users(id),
  organization_id uuid references public.customer_organizations(id),
  points bigint not null check (points > 0),
  request_id uuid not null,
  status text not null default 'pending' check (status in ('pending','fulfilled')),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  check ((user_id is null) <> (organization_id is null))
);
create unique index if not exists customer_reward_catalog_redemptions_user_request
  on public.customer_reward_catalog_redemptions(user_id, request_id) where user_id is not null;
create unique index if not exists customer_reward_catalog_redemptions_org_request
  on public.customer_reward_catalog_redemptions(organization_id, request_id) where organization_id is not null;
alter table public.customer_reward_catalog enable row level security;
alter table public.customer_reward_catalog_redemptions enable row level security;
revoke all on public.customer_reward_catalog, public.customer_reward_catalog_redemptions from public, anon, authenticated;
grant all on public.customer_reward_catalog, public.customer_reward_catalog_redemptions to service_role;

create or replace function public.customer_reward_catalog()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_personal_user();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'kind',kind,'points_cost',points_cost,'description',description,'stock',stock
  ) order by points_cost, name) from customer_reward_catalog where is_active),'[]');
end $$;
revoke all on function public.customer_reward_catalog() from public, anon;
grant execute on function public.customer_reward_catalog() to authenticated;

create or replace function public.customer_personal_redeem_catalog(p_request_id uuid, p_catalog_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid := private.customer_personal_user(); v_item customer_reward_catalog%rowtype;
  v_existing uuid; v_left bigint; v_lot record; v_id uuid;
begin
  if p_request_id is null then raise exception 'invalid_request' using errcode='P0001'; end if;
  select id into v_existing from customer_reward_catalog_redemptions where user_id=v_uid and request_id=p_request_id;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'balance', private.customer_personal_reward_balance(v_uid));
  end if;
  insert into customer_personal_reward_accounts(user_id) values(v_uid) on conflict do nothing;
  perform 1 from customer_personal_reward_accounts where user_id=v_uid for update;
  select * into v_item from customer_reward_catalog where id=p_catalog_id for update;
  if v_item.id is null or not v_item.is_active or v_item.stock < 1 then raise exception 'catalog_unavailable' using errcode='P0001'; end if;
  if private.customer_personal_reward_balance(v_uid) < v_item.points_cost then raise exception 'insufficient_points' using errcode='P0001'; end if;
  v_left := v_item.points_cost;
  for v_lot in select id, remaining_points from customer_personal_reward_entries
    where user_id=v_uid and remaining_points>0 and (expires_at is null or expires_at>now()) and (available_at is null or available_at<=now())
    order by expires_at nulls last, id for update loop
    exit when v_left=0;
    update customer_personal_reward_entries set remaining_points=remaining_points-least(v_left, v_lot.remaining_points) where id=v_lot.id;
    v_left := v_left - least(v_left, v_lot.remaining_points);
  end loop;
  if v_left <> 0 then raise exception 'insufficient_points' using errcode='P0001'; end if;
  update customer_reward_catalog set stock=stock-1 where id=v_item.id;
  v_id := gen_random_uuid();
  insert into customer_reward_catalog_redemptions(id, catalog_id, user_id, points, request_id)
    values(v_id, v_item.id, v_uid, v_item.points_cost, p_request_id);
  insert into customer_personal_reward_entries(user_id, points, remaining_points, kind, event_key)
    values(v_uid, -v_item.points_cost, 0, 'redeem', 'catalog:'||v_id);
  return jsonb_build_object('id', v_id, 'balance', private.customer_personal_reward_balance(v_uid));
end $$;
revoke all on function public.customer_personal_redeem_catalog(uuid, uuid) from public, anon;
grant execute on function public.customer_personal_redeem_catalog(uuid, uuid) to authenticated;

create or replace function public.customer_portal_redeem_catalog(p_request_id uuid, p_catalog_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_item customer_reward_catalog%rowtype;
  v_existing uuid; v_left bigint; v_lot record; v_id uuid;
begin
  if p_request_id is null then raise exception 'invalid_request' using errcode='P0001'; end if;
  select id into v_existing from customer_reward_catalog_redemptions where organization_id=v_org and request_id=p_request_id;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'balance', private.customer_reward_balance(v_org));
  end if;
  insert into customer_reward_accounts(organization_id) values(v_org) on conflict do nothing;
  perform 1 from customer_reward_accounts where organization_id=v_org for update;
  select * into v_item from customer_reward_catalog where id=p_catalog_id for update;
  if v_item.id is null or not v_item.is_active or v_item.stock < 1 then raise exception 'catalog_unavailable' using errcode='P0001'; end if;
  if private.customer_reward_balance(v_org) < v_item.points_cost then raise exception 'insufficient_points' using errcode='P0001'; end if;
  v_left := v_item.points_cost;
  for v_lot in select id, remaining_points from customer_reward_entries
    where organization_id=v_org and remaining_points>0 and (expires_at is null or expires_at>now()) and (available_at is null or available_at<=now())
    order by expires_at nulls last, id for update loop
    exit when v_left=0;
    update customer_reward_entries set remaining_points=remaining_points-least(v_left, v_lot.remaining_points) where id=v_lot.id;
    v_left := v_left - least(v_left, v_lot.remaining_points);
  end loop;
  if v_left <> 0 then raise exception 'insufficient_points' using errcode='P0001'; end if;
  update customer_reward_catalog set stock=stock-1 where id=v_item.id;
  v_id := gen_random_uuid();
  insert into customer_reward_catalog_redemptions(id, catalog_id, organization_id, points, request_id)
    values(v_id, v_item.id, v_org, v_item.points_cost, p_request_id);
  insert into customer_reward_entries(organization_id, points, remaining_points, kind, order_id, actor_id, event_key)
    values(v_org, -v_item.points_cost, 0, 'redeem', null, auth.uid(), 'catalog:'||v_id);
  return jsonb_build_object('id', v_id, 'balance', private.customer_reward_balance(v_org));
end $$;
revoke all on function public.customer_portal_redeem_catalog(uuid, uuid) from public, anon;
grant execute on function public.customer_portal_redeem_catalog(uuid, uuid) to authenticated;

create or replace function public.customer_portal_ops_list_reward_catalog()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'kind',kind,'points_cost',points_cost,'description',description,'stock',stock,'is_active',is_active
  ) order by is_active desc, points_cost, name) from customer_reward_catalog),'[]');
end $$;

create or replace function public.customer_portal_ops_upsert_reward_catalog(
  p_id uuid, p_name text, p_kind text, p_points bigint, p_description text, p_stock integer, p_active boolean
) returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); v_name text := btrim(coalesce(p_name,''));
begin
  perform private.customer_portal_ops_require(true);
  if v_name = '' or p_kind not in ('gift','voucher') or p_points is null or p_points < 1 or p_stock is null or p_stock < 0 or p_active is null then
    raise exception 'invalid_catalog_item' using errcode='P0001';
  end if;
  insert into customer_reward_catalog(id, name, kind, points_cost, description, stock, is_active)
    values(v_id, v_name, p_kind, p_points, btrim(coalesce(p_description,'')), p_stock, p_active)
  on conflict (id) do update set name=excluded.name, kind=excluded.kind, points_cost=excluded.points_cost,
    description=excluded.description, stock=excluded.stock, is_active=excluded.is_active;
  return v_id;
end $$;

create or replace function public.customer_portal_ops_list_reward_redemptions()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'name',c.name,'kind',c.kind,'points',r.points,'status',r.status,
    'account',coalesce(o.name, u.email),'created_at',r.created_at
  ) order by r.created_at desc) from (
    select * from customer_reward_catalog_redemptions order by created_at desc limit 100
  ) r
  join customer_reward_catalog c on c.id=r.catalog_id
  left join customer_organizations o on o.id=r.organization_id
  left join auth.users u on u.id=r.user_id),'[]');
end $$;

create or replace function public.customer_portal_ops_fulfill_reward_redemption(p_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(true);
  update customer_reward_catalog_redemptions set status='fulfilled', fulfilled_at=now()
    where id=p_id and status='pending';
  if not found then raise exception 'redemption_not_pending' using errcode='P0001'; end if;
end $$;

revoke all on function public.customer_portal_ops_list_reward_catalog(), public.customer_portal_ops_upsert_reward_catalog(uuid, text, text, bigint, text, integer, boolean),
  public.customer_portal_ops_list_reward_redemptions(), public.customer_portal_ops_fulfill_reward_redemption(uuid) from public, anon;
grant execute on function public.customer_portal_ops_list_reward_catalog(), public.customer_portal_ops_upsert_reward_catalog(uuid, text, text, bigint, text, integer, boolean),
  public.customer_portal_ops_list_reward_redemptions(), public.customer_portal_ops_fulfill_reward_redemption(uuid) to authenticated;
