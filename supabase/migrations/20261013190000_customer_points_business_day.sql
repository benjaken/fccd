-- Points post one Hong Kong business day after completion. Weekend days do not count.
-- Entries dated in the future stay out of the balance. Cancelling before that time voids the earn.

create or replace function private.customer_points_available_at(p_completed timestamptz)
returns timestamptz language plpgsql immutable as $$
declare v_at timestamp := p_completed at time zone 'Asia/Hong_Kong'; v_left int := 1;
begin
  while v_left > 0 loop
    v_at := v_at + interval '1 day';
    if extract(dow from v_at) not in (0, 6) then v_left := v_left - 1; end if;
  end loop;
  return v_at at time zone 'Asia/Hong_Kong';
end $$;
revoke all on function private.customer_points_available_at(timestamptz) from public, anon, authenticated;

alter table public.customer_personal_reward_entries add column if not exists available_at timestamptz;
alter table public.customer_reward_entries add column if not exists available_at timestamptz;

create or replace function private.customer_personal_reward_balance(p_user uuid)
returns bigint language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(sum(points) filter (where available_at is null or available_at <= now()),0)::bigint
    - coalesce(sum(remaining_points) filter (where expires_at <= now() and (available_at is null or available_at <= now())),0)::bigint
  from public.customer_personal_reward_entries where user_id=p_user
$$;

create or replace function private.customer_reward_balance(p_org uuid)
returns bigint language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(sum(points) filter (where available_at is null or available_at <= now()),0)::bigint
    - coalesce(sum(remaining_points) filter (where expires_at <= now() and (available_at is null or available_at <= now())),0)::bigint
  from public.customer_reward_entries where organization_id=p_org
$$;

create or replace function public.customer_personal_award_completed_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_quote customer_personal_quotes%rowtype; v_points bigint; v_threshold numeric; v_local date; v_expiry timestamptz; v_available timestamptz;
begin
  select * into v_quote from customer_personal_quotes where order_id=p_order_id;
  if v_quote.order_id is null then return; end if;
  if not exists(select 1 from orders where id=p_order_id and document_type='order' and archived_at is null) then return; end if;
  insert into customer_personal_reward_accounts(user_id) values(v_quote.user_id) on conflict do nothing;
  perform 1 from customer_personal_reward_accounts where user_id=v_quote.user_id for update;
  select * into v_quote from customer_personal_quotes where order_id=p_order_id for update;
  if v_quote.earned_at is not null then return; end if;
  if not exists(select 1 from orders where id=p_order_id and document_type='order'
    and delivery_status in ('已送達','己送達','已取','已取貨') and archived_at is null) then return; end if;
  select r.hkd_per_point into v_threshold from customer_reward_rules r
    where r.id=coalesce(v_quote.reward_rule_id, (select id from customer_reward_rules where effective_at<=now() order by effective_at desc limit 1));
  v_points := case when v_threshold is null or v_threshold <= 0 then 0 else floor(v_quote.food_amount / v_threshold)::bigint end;
  v_local := (now() at time zone 'Asia/Hong_Kong')::date;
  v_expiry := ((v_local + interval '1 year')::date + time '23:59:59') at time zone 'Asia/Hong_Kong';
  v_available := private.customer_points_available_at(now());
  if v_points > 0 then
    insert into customer_personal_reward_entries(user_id,points,remaining_points,kind,order_id,event_key,expires_at,available_at)
      values(v_quote.user_id,v_points,v_points,'earn',p_order_id,'earn:'||p_order_id,v_expiry,v_available);
  end if;
  update customer_personal_quotes set earned_at=now() where order_id=p_order_id;
end $$;

create or replace function public.customer_portal_award_completed_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_po customer_portal_orders%rowtype; v_points bigint; v_threshold numeric; v_local date; v_expiry timestamptz; v_available timestamptz;
begin
  select * into v_po from customer_portal_orders where order_id=p_order_id;
  if v_po.order_id is null then return; end if;
  if not exists(select 1 from orders where id=p_order_id and document_type='order' and archived_at is null) then return; end if;
  insert into customer_reward_accounts(organization_id) values(v_po.organization_id) on conflict do nothing;
  perform 1 from customer_reward_accounts where organization_id=v_po.organization_id for update;
  select * into v_po from customer_portal_orders where order_id=p_order_id for update;
  if v_po.earned_at is not null then return; end if;
  if not exists(select 1 from orders where id=p_order_id and document_type='order'
    and delivery_status in ('已送達','己送達','已取','已取貨') and archived_at is null) then return; end if;
  select r.hkd_per_point into v_threshold from customer_reward_rules r where r.id=v_po.reward_rule_id;
  v_points := case when v_threshold is null or v_threshold <= 0 then 0 else floor(v_po.food_amount / v_threshold)::bigint end;
  v_local := (now() at time zone 'Asia/Hong_Kong')::date;
  v_expiry := ((v_local + interval '1 year')::date + time '23:59:59') at time zone 'Asia/Hong_Kong';
  v_available := private.customer_points_available_at(now());
  if v_points > 0 then
    insert into customer_reward_entries(organization_id,points,remaining_points,kind,order_id,event_key,expires_at,available_at)
      values(v_po.organization_id,v_points,v_points,'earn',p_order_id,'earn:'||p_order_id,v_expiry,v_available);
  end if;
  update customer_portal_orders set earned_at=now() where order_id=p_order_id;
end $$;

create or replace function public.customer_personal_clawback_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid; v_earned bigint; v_available timestamptz; v_balance bigint; v_take bigint; v_left bigint; v_lot record;
begin
  select user_id into v_user from customer_personal_quotes where order_id=p_order_id;
  if v_user is null then return; end if;
  select points, available_at into v_earned, v_available from customer_personal_reward_entries where event_key='earn:'||p_order_id and kind='earn';
  if v_available > now() then
    delete from customer_personal_reward_entries where event_key='earn:'||p_order_id and kind='earn';
    return;
  end if;
  if exists(select 1 from customer_personal_reward_entries where event_key='clawback:'||p_order_id)
    or exists(select 1 from customer_personal_reward_pending where event_key='pending:'||p_order_id) then return; end if;
  if coalesce(v_earned,0) <= 0 then return; end if;
  insert into customer_personal_reward_accounts(user_id) values(v_user) on conflict do nothing;
  perform 1 from customer_personal_reward_accounts where user_id=v_user for update;
  v_balance := greatest(private.customer_personal_reward_balance(v_user),0);
  v_take := least(v_earned, v_balance);
  v_left := v_take;
  if v_take > 0 then
    for v_lot in select id, remaining_points from customer_personal_reward_entries
      where user_id=v_user and remaining_points>0 and (expires_at is null or expires_at>now()) and (available_at is null or available_at<=now())
      order by expires_at nulls last, id for update loop
      exit when v_left=0;
      update customer_personal_reward_entries set remaining_points=remaining_points-least(v_left,v_lot.remaining_points) where id=v_lot.id;
      v_left := v_left-least(v_left,v_lot.remaining_points);
    end loop;
    insert into customer_personal_reward_entries(user_id,points,remaining_points,kind,order_id,event_key)
      values(v_user,-v_take,0,'clawback',p_order_id,'clawback:'||p_order_id);
  end if;
  if v_earned > v_take then
    insert into customer_personal_reward_pending(user_id,order_id,points,event_key)
      values(v_user,p_order_id,v_earned-v_take,'pending:'||p_order_id);
  end if;
end $$;

create or replace function public.customer_portal_clawback_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid; v_earned bigint; v_available timestamptz; v_balance bigint; v_take bigint; v_left bigint; v_lot record;
begin
  select organization_id into v_org from customer_portal_orders where order_id=p_order_id;
  if v_org is null then return; end if;
  select points, available_at into v_earned, v_available from customer_reward_entries where event_key='earn:'||p_order_id and kind='earn';
  if v_available > now() then
    delete from customer_reward_entries where event_key='earn:'||p_order_id and kind='earn';
    return;
  end if;
  if exists(select 1 from customer_reward_entries where event_key='clawback:'||p_order_id)
    or exists(select 1 from customer_reward_pending where event_key='pending:'||p_order_id) then return; end if;
  if coalesce(v_earned,0) <= 0 then return; end if;
  insert into customer_reward_accounts(organization_id) values(v_org) on conflict do nothing;
  perform 1 from customer_reward_accounts where organization_id=v_org for update;
  v_balance := greatest(private.customer_reward_balance(v_org),0);
  v_take := least(v_earned, v_balance);
  v_left := v_take;
  if v_take > 0 then
    for v_lot in select id, remaining_points from customer_reward_entries
      where organization_id=v_org and remaining_points>0 and (expires_at is null or expires_at>now()) and (available_at is null or available_at<=now())
      order by expires_at nulls last, id for update loop
      exit when v_left=0;
      update customer_reward_entries set remaining_points=remaining_points-least(v_left,v_lot.remaining_points) where id=v_lot.id;
      v_left := v_left-least(v_left,v_lot.remaining_points);
    end loop;
    insert into customer_reward_entries(organization_id,points,remaining_points,kind,order_id,actor_id,event_key)
      values(v_org,-v_take,0,'clawback',p_order_id,null,'clawback:'||p_order_id);
  end if;
  if v_earned > v_take then
    insert into customer_reward_pending(organization_id,order_id,points,event_key)
      values(v_org,p_order_id,v_earned-v_take,'pending:'||p_order_id);
  end if;
end $$;

create or replace function public.customer_personal_points()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user();
begin
  return jsonb_build_object(
    'balance',private.customer_personal_reward_balance(v_uid),
    'pending',coalesce((select sum(points) from customer_personal_reward_pending where user_id=v_uid),0),
    'incoming',coalesce((select sum(points) from customer_personal_reward_entries where user_id=v_uid and kind='earn' and available_at>now()),0),
    'incoming_at',(select min(available_at) from customer_personal_reward_entries where user_id=v_uid and kind='earn' and available_at>now()),
    'ledger',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'points',e.points,'kind',e.kind,'order_id',e.order_id,'expires_at',e.expires_at,'available_at',e.available_at,'created_at',e.created_at
    ) order by e.created_at desc) from (
      select id,points,kind,order_id,expires_at,available_at,created_at from customer_personal_reward_entries
      where user_id=v_uid order by created_at desc limit 100
    ) e),'[]')
  );
end $$;
