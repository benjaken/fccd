-- Dates when portal orders are refused. These are not point-posting holidays.
create table if not exists public.customer_order_blackouts (
  blackout_on date primary key,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
alter table public.customer_order_blackouts enable row level security;
revoke all on public.customer_order_blackouts from public, anon, authenticated;
grant all on public.customer_order_blackouts to service_role;

create or replace function private.customer_order_blackout_require(p_manage boolean)
returns void language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  begin
    perform private.customer_portal_reward_rules_require(p_manage);
    return;
  exception
    when insufficient_privilege then
      perform private.customer_portal_ops_require(p_manage);
  end;
end $$;
revoke all on function private.customer_order_blackout_require(boolean) from public, anon, authenticated;

create or replace function public.customer_portal_ops_list_order_blackouts()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_order_blackout_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'blackout_on', blackout_on, 'name', name
  ) order by blackout_on) from customer_order_blackouts), '[]'::jsonb);
end $$;

create or replace function public.customer_portal_ops_set_order_blackout(p_day date, p_name text, p_remove boolean default false)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_order_blackout_require(true);
  if p_day is null then raise exception 'invalid_blackout'; end if;
  if coalesce(p_remove, false) then
    delete from customer_order_blackouts where blackout_on = p_day;
    return;
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'invalid_blackout'; end if;
  insert into customer_order_blackouts(blackout_on, name) values (p_day, btrim(p_name))
  on conflict (blackout_on) do update set name = excluded.name;
end $$;

create or replace function private.customer_reject_blackout_order()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists (
    select 1 from orders o
    where o.id = new.order_id
      and exists (
        select 1 from customer_order_blackouts b
        where b.blackout_on = (o.delivery_at at time zone 'Asia/Hong_Kong')::date
      )
  ) then
    raise exception 'order_blackout';
  end if;
  return new;
end $$;

drop trigger if exists customer_reject_blackout_order on public.customer_portal_orders;
create trigger customer_reject_blackout_order
  before insert on public.customer_portal_orders
  for each row execute function private.customer_reject_blackout_order();

revoke all on function public.customer_portal_ops_list_order_blackouts() from public, anon;
revoke all on function public.customer_portal_ops_set_order_blackout(date, text, boolean) from public, anon;
grant execute on function public.customer_portal_ops_list_order_blackouts() to authenticated;
grant execute on function public.customer_portal_ops_set_order_blackout(date, text, boolean) to authenticated;
