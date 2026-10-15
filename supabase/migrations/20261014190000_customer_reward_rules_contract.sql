-- Apply the existing HKD-per-point migration first. This repair must not publish
-- a new editor contract while the database still awards points under old rules.
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='customer_reward_rules' and column_name='hkd_per_point')
    or coalesce(position('hkd_per_point' in pg_get_functiondef(to_regprocedure('public.customer_portal_award_completed_order(uuid)'))),0)=0 then
    raise exception 'reward_rule_prerequisite_migration_required';
  end if;
end $$;
create or replace function public.customer_portal_ops_list_reward_rules()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_reward_rules_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,
    'hkd_per_point',r.hkd_per_point,
    'effective_at',r.effective_at,
    'created_at',r.created_at,
    'created_by',r.created_by,
    'is_active',r.id = (
      select id from customer_reward_rules
      where effective_at <= now()
      order by effective_at desc
      limit 1
    )
  ) order by r.effective_at desc)
    from customer_reward_rules r),'[]'::jsonb);
end $$;

drop function if exists public.customer_portal_ops_create_reward_rule(numeric, timestamptz);

create function public.customer_portal_ops_create_reward_rule(
  p_hkd_per_point numeric,
  p_effective_at timestamptz
)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid;
begin
  perform private.customer_portal_reward_rules_require(true);
  if p_hkd_per_point is null or p_hkd_per_point < 0 or p_hkd_per_point > 100000 then
    raise exception 'invalid_reward_rule';
  end if;
  if p_effective_at is null then raise exception 'invalid_reward_rule'; end if;
  begin
    insert into customer_reward_rules(points_per_hkd, hkd_per_point, effective_at, created_by)
      values(0, p_hkd_per_point, p_effective_at, auth.uid())
      returning id into v_id;
  exception
    when unique_violation then
      raise exception 'duplicate_effective_at';
  end;
  return v_id;
end $$;

revoke all on function public.customer_portal_ops_create_reward_rule(numeric, timestamptz) from public, anon;
grant execute on function public.customer_portal_ops_create_reward_rule(numeric, timestamptz) to authenticated;
