alter table public.customer_historical_reward_grants add column welcome_seen_at timestamptz;

create function public.customer_personal_historical_reward_notice()
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user(); v_result jsonb;
begin
  perform private.customer_claim_historical_rewards(v_uid);
  select jsonb_build_object('batchKey',batch_key,'claimedAt',claimed_at,
    'points',points,'expiresAt',expires_at) into v_result from (
    select g.batch_key,g.claimed_at,sum(g.points-g.adjusted_points) points,min(e.expires_at) expires_at
    from customer_historical_reward_grants g
    join customer_personal_reward_entries e on e.id=g.ledger_id and e.user_id=v_uid
    where g.claimed_by=v_uid and g.claimed_at is not null and g.welcome_seen_at is null
      and e.expires_at>now() and g.points>g.adjusted_points
    group by g.batch_key,g.claimed_at order by g.claimed_at limit 1
  ) notice;
  return v_result;
end $$;

create function public.customer_personal_acknowledge_reward_notice(p_batch_key text,p_claimed_at timestamptz)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid:=private.customer_personal_user();
begin
  update customer_historical_reward_grants set welcome_seen_at=coalesce(welcome_seen_at,now())
    where claimed_by=v_uid and batch_key=p_batch_key and claimed_at=p_claimed_at;
end $$;
revoke all on function public.customer_personal_historical_reward_notice(),
  public.customer_personal_acknowledge_reward_notice(text,timestamptz) from public,anon;
grant execute on function public.customer_personal_historical_reward_notice(),
  public.customer_personal_acknowledge_reward_notice(text,timestamptz) to authenticated;
