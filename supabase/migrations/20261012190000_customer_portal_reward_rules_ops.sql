-- Staff editor for global customer reward earn-rate versions (F07.1).
alter table public.customer_reward_rules
  add column if not exists created_by uuid references auth.users(id);

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
) values
  ('settings.customer_portal.reward_rules', '客戶積分規則', '/settings/customer-portal/reward-rules', 128, false, 'promotion', 'page'),
  ('settings.customer_portal.reward_rules.edit', '編輯客戶積分規則', '/settings/customer-portal/reward-rules/actions/edit', 129, true, 'settings.customer_portal.reward_rules', 'action')
on conflict (page_key) do update set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select roles.role, pages.page_key, true, true
from (values ('Super Admin'), ('Admin')) roles(role)
cross join (values
  ('settings.customer_portal.reward_rules'),
  ('settings.customer_portal.reward_rules.edit'),
  ('promotion')
) pages(page_key)
on conflict (role, page_key) do update set
  can_access = true, can_manage = true, updated_at = now();

create or replace function private.customer_portal_reward_rules_require(p_manage boolean default false)
returns void language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  if p_manage then
    if not private.has_page_access('settings.customer_portal.reward_rules.edit')
      and not private.has_page_manage('settings.customer_portal.reward_rules') then
      raise exception 'page_access_required' using errcode='42501';
    end if;
  elsif not private.has_page_access('settings.customer_portal.reward_rules') then
    raise exception 'page_access_required' using errcode='42501';
  end if;
end $$;
revoke all on function private.customer_portal_reward_rules_require(boolean) from public, anon, authenticated;

create or replace function public.customer_portal_ops_list_reward_rules()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_reward_rules_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,
    'points_per_hkd',r.points_per_hkd,
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

create or replace function public.customer_portal_ops_create_reward_rule(
  p_points_per_hkd numeric,
  p_effective_at timestamptz
)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid;
begin
  perform private.customer_portal_reward_rules_require(true);
  if p_points_per_hkd is null or p_points_per_hkd < 0 or p_points_per_hkd > 100000 then
    raise exception 'invalid_reward_rule';
  end if;
  if p_effective_at is null then raise exception 'invalid_reward_rule'; end if;
  begin
    insert into customer_reward_rules(points_per_hkd, effective_at, created_by)
      values(p_points_per_hkd, p_effective_at, auth.uid())
      returning id into v_id;
  exception
    when unique_violation then
      raise exception 'duplicate_effective_at';
  end;
  return v_id;
end $$;

do $$ declare signature text; begin
  foreach signature in array array[
    'customer_portal_ops_list_reward_rules()',
    'customer_portal_ops_create_reward_rule(numeric,timestamptz)'
  ] loop
    execute 'revoke all on function public.'||signature||' from public,anon';
    execute 'grant execute on function public.'||signature||' to authenticated';
  end loop;
end $$;
