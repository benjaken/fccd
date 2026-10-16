-- Apply the welcome migration and this test inside a ROLLBACK transaction.
do $$
declare v_user uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid(); v_email text;
  v_notice jsonb; v_count integer;
begin
  select g.email_normalized into v_email from customer_historical_reward_grants g
    where g.claimed_at is null and private.customer_historical_reward_target(g.order_id)>0
      and not exists(select 1 from auth.users u where lower(btrim(u.email))=g.email_normalized)
    limit 1;
  if v_email is null then raise exception 'test_fixture_missing'; end if;
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at)
    values(v_user,v_email,now(),'{}','{}',now()),
      (v_other,'reward-welcome-test-'||v_other||'@example.com',now(),'{}','{}',now());
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  v_notice:=public.customer_personal_historical_reward_notice();
  if (v_notice->>'points')::bigint<=0 or v_notice->>'expiresAt' is null then raise exception 'notice_missing'; end if;
  select count(*) into v_count from customer_personal_reward_entries where user_id=v_user;
  perform public.customer_personal_historical_reward_notice();
  if (select count(*) from customer_personal_reward_entries where user_id=v_user)<>v_count then raise exception 'read_reawarded_points'; end if;
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  if public.customer_personal_historical_reward_notice() is not null then raise exception 'cross_account_notice'; end if;
  perform public.customer_personal_acknowledge_reward_notice(v_notice->>'batchKey',(v_notice->>'claimedAt')::timestamptz);
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  if public.customer_personal_historical_reward_notice() is null then raise exception 'cross_account_ack'; end if;
  perform public.customer_personal_acknowledge_reward_notice(v_notice->>'batchKey',(v_notice->>'claimedAt')::timestamptz);
  perform public.customer_personal_acknowledge_reward_notice(v_notice->>'batchKey',(v_notice->>'claimedAt')::timestamptz);
  if public.customer_personal_historical_reward_notice() is not null then raise exception 'notice_not_dismissed'; end if;
  if has_function_privilege('anon','public.customer_personal_historical_reward_notice()','execute')
    or has_function_privilege('anon','public.customer_personal_acknowledge_reward_notice(text,timestamptz)','execute') then
    raise exception 'anonymous_notice_privilege'; end if;
end $$;
