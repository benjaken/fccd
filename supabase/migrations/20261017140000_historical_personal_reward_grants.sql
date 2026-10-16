-- Historical campaign: service dates from 2025-10-16, personal email ownership.
-- Campaign rows are loaded separately from the reviewed manifest, never from all orders.
create table public.customer_historical_reward_grants (
  order_id uuid primary key references public.orders(id),
  batch_key text not null,
  email_normalized text not null check (email_normalized = lower(btrim(email_normalized))),
  food_amount numeric(14,2) not null check (food_amount >= 25),
  points bigint not null check (points > 0 and points = floor(food_amount / 25)),
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  ledger_id uuid unique references public.customer_personal_reward_entries(id),
  adjusted_points bigint not null default 0 check (adjusted_points >= 0 and adjusted_points <= points),
  check ((claimed_by is null and claimed_at is null and ledger_id is null)
    or (claimed_by is not null and claimed_at is not null and ledger_id is not null))
);
create index customer_historical_reward_email_idx
  on public.customer_historical_reward_grants(email_normalized) where claimed_at is null;
alter table public.customer_historical_reward_grants enable row level security;
revoke all on public.customer_historical_reward_grants from public, anon, authenticated;
grant select, insert, update on public.customer_historical_reward_grants to service_role;

-- Recheck on each claim: the campaign amount is a cap, never a reason to overpay.
create function private.customer_historical_reward_target(p_order uuid)
returns bigint language sql stable security definer set search_path=public,private,pg_temp as $$
  select coalesce((select least(g.points, greatest(0, floor((
    least(g.food_amount, o.grand_total - coalesce(o.shipping_fee,0))
    - coalesce((select sum(f.food_amount) from customer_food_refunds f where f.order_id=o.id),0)
  ) / 25))::bigint)
  from customer_historical_reward_grants g join orders o on o.id=g.order_id
  where g.order_id=p_order and o.document_type='order' and o.archived_at is null
    and o.merged_into_order_id is null and o.delivery_status in ('已送達','己送達','已取','已取貨')
    and o.delivery_at >= '2025-10-16T00:00:00+08:00'::timestamptz
    and o.delivery_at <= g.created_at
    and lower(btrim(o.email_snapshot))=g.email_normalized
    and g.email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    and g.email_normalized !~ '@(chifung[.]net|foodchannels-delivery[.]com|foodchannels-catering[.]com)$'
    and o.order_number is not null and o.order_number !~* '\mvoid\M'
    and o.currency='HKD' and coalesce(o.shipping_fee,0)>=0
    and coalesce(o.cashdollar_redeemed,0)=0
    and private.customer_order_payment_posted(o.id)
    and not exists(select 1 from orders d where d.id<>o.id and d.order_number=o.order_number
      and d.document_type='order' and d.archived_at is null)
    and not exists(select 1 from customer_reward_entries e where e.order_id=o.id)
    and not exists(select 1 from customer_portal_orders po where po.order_id=o.id)
    and not exists(select 1 from customer_personal_quotes pq where pq.order_id=o.id)
  ),0)::bigint
$$;

create function private.customer_claim_historical_rewards(p_user uuid)
returns bigint language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_email text; v_grant record; v_points bigint; v_id uuid; v_total bigint:=0; v_at timestamptz:=now();
begin
  select lower(btrim(email)) into v_email from auth.users
    where id=p_user and email_confirmed_at is not null and deleted_at is null
      and (banned_until is null or banned_until<=now());
  if v_email is null or (select count(*) from auth.users
    where lower(btrim(email))=v_email and deleted_at is null)<>1 then return 0; end if;
  if not exists(select 1 from customer_historical_reward_grants
    where email_normalized=v_email and claimed_at is null) then return 0; end if;
  insert into customer_personal_reward_accounts(user_id) values(p_user) on conflict do nothing;
  perform 1 from customer_personal_reward_accounts where user_id=p_user for update;
  for v_grant in select * from customer_historical_reward_grants
    where email_normalized=v_email and claimed_at is null order by order_id for update loop
    -- Serialize claim with cancellation/refund processing on this campaign row.
    v_points:=private.customer_historical_reward_target(v_grant.order_id);
    if v_points<=0 or exists(select 1 from customer_personal_reward_entries
      where order_id=v_grant.order_id) then continue; end if;
    insert into customer_personal_reward_entries(user_id,points,remaining_points,kind,order_id,event_key,
      created_at,available_at,expires_at)
    values(p_user,v_points,v_points,'earn',v_grant.order_id,'earn:'||v_grant.order_id,
      v_at,null,v_at+interval '1 year') returning id into v_id;
    update customer_historical_reward_grants set claimed_by=p_user,claimed_at=v_at,
      ledger_id=v_id,adjusted_points=points-v_points where order_id=v_grant.order_id;
    v_total:=v_total+v_points;
  end loop;
  return v_total;
end $$;

create function private.customer_historical_rewards_on_verified_email()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if new.email_confirmed_at is not null then
    perform private.customer_claim_historical_rewards(new.id);
  end if;
  return new;
end $$;
create trigger customer_claim_historical_rewards_after_verification
  after insert or update of email,email_confirmed_at on auth.users
  for each row execute function private.customer_historical_rewards_on_verified_email();

-- Reductions use the existing personal ledger/pending debt conventions.
create function private.customer_reconcile_historical_reward(p_order uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid; g customer_historical_reward_grants%rowtype; v_target bigint;
  v_due bigint; v_original_due bigint; v_expired bigint; v_take bigint; v_left bigint; v_lot record; v_key text;
begin
  select claimed_by into v_user from customer_historical_reward_grants where order_id=p_order;
  if v_user is null then return; end if;
  perform 1 from customer_personal_reward_accounts where user_id=v_user for update;
  select * into g from customer_historical_reward_grants where order_id=p_order for update;
  v_target:=private.customer_historical_reward_target(p_order);
  v_due:=greatest(g.points-g.adjusted_points-v_target,0);
  if v_due=0 then return; end if;
  v_original_due:=v_due;
  -- Expired, unused points already left the balance. Retire them without debt.
  select least(v_due,remaining_points) into v_expired from customer_personal_reward_entries
    where id=g.ledger_id and expires_at<=now() for update;
  if coalesce(v_expired,0)>0 then
    update customer_personal_reward_entries set remaining_points=remaining_points-v_expired where id=g.ledger_id;
    insert into customer_personal_reward_entries(user_id,points,remaining_points,kind,order_id,event_key)
      values(v_user,-v_expired,0,'clawback',p_order,'historical-expired:'||p_order||':'||(g.adjusted_points+v_original_due));
    v_due:=v_due-v_expired;
  end if;
  v_take:=least(v_due,greatest(private.customer_personal_reward_balance(v_user),0));
  v_left:=v_take;
  v_key:='historical-adjust:'||p_order||':'||(g.adjusted_points+v_original_due);
  for v_lot in select id,remaining_points from customer_personal_reward_entries
    where user_id=v_user and remaining_points>0 and (expires_at is null or expires_at>now())
      and (available_at is null or available_at<=now()) order by expires_at nulls last,id for update loop
    exit when v_left=0;
    update customer_personal_reward_entries set remaining_points=remaining_points-least(v_left,v_lot.remaining_points)
      where id=v_lot.id;
    v_left:=v_left-least(v_left,v_lot.remaining_points);
  end loop;
  if v_take>0 then
    insert into customer_personal_reward_entries(user_id,points,remaining_points,kind,order_id,event_key)
      values(v_user,-v_take,0,'clawback',p_order,v_key);
  end if;
  if v_due>v_take then
    insert into customer_personal_reward_pending(user_id,order_id,points,event_key)
      values(v_user,p_order,v_due-v_take,'pending:'||v_key);
  end if;
  update customer_historical_reward_grants set adjusted_points=adjusted_points+v_original_due where order_id=p_order;
end $$;

create function private.customer_historical_rewards_order_changed()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_reconcile_historical_reward(new.id);
  return new;
end $$;
create trigger customer_historical_rewards_order_changed after update of
  delivery_status,archived_at,merged_into_order_id,grand_total,shipping_fee,email_snapshot,
  payment_status_source,shopify_financial_status,cashdollar_redeemed,delivery_at,currency,order_number
  on public.orders for each row execute function private.customer_historical_rewards_order_changed();

create function private.customer_historical_rewards_payment_changed()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if tg_op<>'INSERT' then perform private.customer_reconcile_historical_reward(old.order_id); end if;
  if tg_op<>'DELETE' then perform private.customer_reconcile_historical_reward(new.order_id); end if;
  return null;
end $$;
create trigger customer_historical_rewards_payment_changed after insert or update or delete
  on public.payments for each row execute function private.customer_historical_rewards_payment_changed();
create trigger customer_historical_rewards_refund_changed after insert or update or delete
  on public.customer_food_refunds for each row execute function private.customer_historical_rewards_payment_changed();

revoke all on function private.customer_historical_reward_target(uuid),
  private.customer_claim_historical_rewards(uuid),private.customer_historical_rewards_on_verified_email(),
  private.customer_reconcile_historical_reward(uuid),private.customer_historical_rewards_order_changed(),
  private.customer_historical_rewards_payment_changed() from public,anon,authenticated;
grant execute on function private.customer_claim_historical_rewards(uuid) to service_role;

-- Reserve campaign orders from the existing external-order award path until verified claim.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.customer_award_external_completed_order(uuid)'::regprocedure) into v_def;
  if position('customer_historical_reward_grants' in v_def)=0 then
    if position('if to_regclass' in v_def)=0 then raise exception 'external_award_contract_changed'; end if;
    v_def:=replace(v_def,'if to_regclass',
      'if exists(select 1 from public.customer_historical_reward_grants where order_id=p_order_id) then return; end if;'||chr(10)||'  if to_regclass');
    execute v_def;
  end if;
end $$;
