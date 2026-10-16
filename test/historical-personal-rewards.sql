-- Run after migration + reviewed campaign seed, inside a transaction that ROLLS BACK.
-- Direct auth inserts do not send authentication emails. No order rows are modified.
do $$
declare v_uid uuid:=gen_random_uuid(); g record; v_expected bigint; v_claimed bigint;
  v_before bigint; v_after bigint; v_refund uuid;
begin
  select * into g from public.customer_historical_reward_grants r
    where not exists(select 1 from auth.users u where lower(btrim(u.email))=r.email_normalized)
      and private.customer_historical_reward_target(r.order_id)>1
    order by order_id limit 1;
  if g.order_id is null then raise exception 'test_fixture_missing'; end if;
  select sum(private.customer_historical_reward_target(order_id)) into v_expected
    from public.customer_historical_reward_grants where email_normalized=g.email_normalized;
  insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(v_uid,g.email_normalized,'{}','{}',now(),now());
  if private.customer_claim_historical_rewards(v_uid)<>0 then raise exception 'unverified_claim'; end if;
  update auth.users set email_confirmed_at=now() where id=v_uid;
  select coalesce(sum(points),0) into v_claimed from public.customer_personal_reward_entries where user_id=v_uid;
  if v_claimed<>v_expected then raise exception 'verified_claim_amount: %, expected %',v_claimed,v_expected; end if;
  if exists(select 1 from public.customer_personal_reward_entries where user_id=v_uid
    and (expires_at<>created_at+interval '1 year' or available_at is not null)) then
    raise exception 'claim_expiry_or_availability'; end if;
  if private.customer_claim_historical_rewards(v_uid)<>0 then raise exception 'duplicate_claim'; end if;
  if has_function_privilege('authenticated','private.customer_claim_historical_rewards(uuid)','execute')
    or has_table_privilege('authenticated','public.customer_historical_reward_grants','select') then
    raise exception 'campaign_privilege_leak'; end if;
  -- A partial refund reduces the historical award; replaying reconciliation is harmless.
  v_before:=private.customer_personal_reward_balance(v_uid);
  insert into public.customer_food_refunds(order_id,food_amount) values(g.order_id,25) returning id into v_refund;
  v_after:=private.customer_personal_reward_balance(v_uid);
  if v_after<>v_before-1 then raise exception 'partial_refund_not_reconciled'; end if;
  perform private.customer_reconcile_historical_reward(g.order_id);
  if private.customer_personal_reward_balance(v_uid)<>v_after then raise exception 'duplicate_adjustment'; end if;
  -- Spending before a full refund produces pending debt, never a negative balance.
  update public.customer_personal_reward_entries set remaining_points=0 where user_id=v_uid;
  insert into public.customer_personal_reward_entries(user_id,points,remaining_points,kind,event_key)
    values(v_uid,-v_after,0,'redeem','test-historical-spend:'||v_uid);
  update public.customer_food_refunds set food_amount=g.food_amount where id=v_refund;
  if private.customer_personal_reward_balance(v_uid)<>0 then raise exception 'negative_balance'; end if;
  if not exists(select 1 from public.customer_personal_reward_pending where user_id=v_uid and order_id=g.order_id)
    then raise exception 'missing_pending_debt'; end if;
  perform private.customer_reconcile_historical_reward(g.order_id);
end $$;

do $$
declare v_uid uuid:=gen_random_uuid(); g record; v_balance bigint;
begin
  select * into g from public.customer_historical_reward_grants r
    where not exists(select 1 from auth.users u where lower(btrim(u.email))=r.email_normalized)
      and private.customer_historical_reward_target(r.order_id)>1 order by order_id limit 1;
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(v_uid,g.email_normalized,now(),'{}','{}',now(),now());
  update public.customer_personal_reward_entries set expires_at=now()-interval '1 day'
    where user_id=v_uid and order_id=g.order_id;
  v_balance:=private.customer_personal_reward_balance(v_uid);
  insert into public.customer_food_refunds(order_id,food_amount) values(g.order_id,g.food_amount);
  if private.customer_personal_reward_balance(v_uid)<>v_balance
    or exists(select 1 from public.customer_personal_reward_pending where user_id=v_uid) then
    raise exception 'expired_unused_points_created_debt'; end if;
end $$;
