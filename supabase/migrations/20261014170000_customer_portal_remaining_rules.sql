-- Finish the remaining portal rules: holidays, partial food-refund clawback,
-- lunchbox stock restore, order export, external-order points, and quote reorder.

create table if not exists public.customer_point_holidays (
  holiday_on date primary key,
  name text not null default ''
);
alter table public.customer_point_holidays enable row level security;
revoke all on public.customer_point_holidays from public, anon, authenticated;
grant all on public.customer_point_holidays to service_role;

create table if not exists public.customer_food_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  food_amount numeric(14,2) not null check (food_amount > 0),
  created_at timestamptz not null default now()
);
alter table public.customer_food_refunds enable row level security;
revoke all on public.customer_food_refunds from public, anon, authenticated;
grant all on public.customer_food_refunds to service_role;

alter table public.customer_personal_quotes add column if not exists stock_restored_at timestamptz;

create or replace function private.customer_shift_point_holiday()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_at timestamp; v_guard int := 0;
begin
  if new.available_at is null then return new; end if;
  v_at := new.available_at at time zone 'Asia/Hong_Kong';
  while v_guard < 30 and (
    extract(dow from v_at) in (0, 6)
    or exists(select 1 from customer_point_holidays where holiday_on = v_at::date)
  ) loop
    v_at := v_at + interval '1 day';
    v_guard := v_guard + 1;
  end loop;
  new.available_at := v_at at time zone 'Asia/Hong_Kong';
  return new;
end $$;
drop trigger if exists customer_personal_points_holiday on public.customer_personal_reward_entries;
create trigger customer_personal_points_holiday before insert on public.customer_personal_reward_entries
  for each row execute function private.customer_shift_point_holiday();
drop trigger if exists customer_org_points_holiday on public.customer_reward_entries;
create trigger customer_org_points_holiday before insert on public.customer_reward_entries
  for each row execute function private.customer_shift_point_holiday();

create or replace function public.customer_portal_ops_list_point_holidays()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object('holiday_on', holiday_on, 'name', name) order by holiday_on)
    from customer_point_holidays), '[]'::jsonb);
end $$;

create or replace function public.customer_portal_ops_set_point_holiday(p_day date, p_name text, p_remove boolean)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(true);
  if p_day is null then raise exception 'invalid_holiday'; end if;
  if coalesce(p_remove, false) then
    delete from customer_point_holidays where holiday_on = p_day;
  else
    insert into customer_point_holidays(holiday_on, name) values(p_day, left(btrim(coalesce(p_name, '')), 80))
    on conflict (holiday_on) do update set name = excluded.name;
  end if;
end $$;

create or replace function private.customer_apply_food_refund(p_order_id uuid, p_food numeric)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid; v_user uuid; v_rule uuid; v_threshold numeric; v_points bigint; v_earned bigint;
  v_already bigint; v_available timestamptz; v_balance bigint; v_take bigint; v_left bigint; v_lot record; v_key text;
begin
  if p_food is null or p_food <= 0 then raise exception 'invalid_refund'; end if;
  insert into customer_food_refunds(order_id, food_amount) values(p_order_id, p_food);
  select organization_id, reward_rule_id into v_org, v_rule from customer_portal_orders where order_id = p_order_id;
  if v_org is not null then
    if exists(select 1 from customer_portal_orders where order_id = p_order_id and earned_at is null) then
      update customer_portal_orders set food_amount = greatest(food_amount - p_food, 0) where order_id = p_order_id;
      return;
    end if;
    select hkd_per_point into v_threshold from customer_reward_rules where id = v_rule;
    select points, available_at into v_earned, v_available from customer_reward_entries where event_key = 'earn:' || p_order_id and kind = 'earn';
  else
    select user_id, reward_rule_id into v_user, v_rule from customer_personal_quotes where order_id = p_order_id;
    if v_user is null then return; end if;
    if exists(select 1 from customer_personal_quotes where order_id = p_order_id and earned_at is null) then
      update customer_personal_quotes set food_amount = greatest(food_amount - p_food, 0) where order_id = p_order_id;
      return;
    end if;
    select hkd_per_point into v_threshold from customer_reward_rules where id = v_rule;
    select points, available_at into v_earned, v_available from customer_personal_reward_entries where event_key = 'earn:' || p_order_id and kind = 'earn';
  end if;
  v_points := case when v_threshold is null or v_threshold <= 0 or v_earned is null then 0 else floor(p_food / v_threshold)::bigint end;
  select coalesce(sum(-points), 0) into v_already from (
    select points from customer_reward_entries where v_org is not null and order_id = p_order_id and kind = 'clawback'
    union all
    select points from customer_personal_reward_entries where v_user is not null and order_id = p_order_id and kind = 'clawback'
  ) clawed;
  v_points := least(v_points, greatest(coalesce(v_earned, 0) - v_already, 0));
  if v_points <= 0 then return; end if;
  if v_available > now() then
    if v_org is not null then
      update customer_reward_entries set points = points - v_points, remaining_points = greatest(remaining_points - v_points, 0)
        where event_key = 'earn:' || p_order_id;
    else
      update customer_personal_reward_entries set points = points - v_points, remaining_points = greatest(remaining_points - v_points, 0)
        where event_key = 'earn:' || p_order_id;
    end if;
    return;
  end if;
  v_key := 'partial:' || gen_random_uuid();
  if v_org is not null then
    insert into customer_reward_accounts(organization_id) values(v_org) on conflict do nothing;
    perform 1 from customer_reward_accounts where organization_id = v_org for update;
    v_balance := greatest(private.customer_reward_balance(v_org), 0);
    v_take := least(v_points, v_balance); v_left := v_take;
    if v_take > 0 then
      for v_lot in select id, remaining_points from customer_reward_entries
        where organization_id = v_org and remaining_points > 0 and (expires_at is null or expires_at > now()) and (available_at is null or available_at <= now())
        order by expires_at nulls last, id for update loop
        exit when v_left = 0;
        update customer_reward_entries set remaining_points = remaining_points - least(v_left, v_lot.remaining_points) where id = v_lot.id;
        v_left := v_left - least(v_left, v_lot.remaining_points);
      end loop;
      insert into customer_reward_entries(organization_id, points, remaining_points, kind, order_id, event_key)
        values(v_org, -v_take, 0, 'clawback', p_order_id, v_key);
    end if;
    if v_points > v_take then
      insert into customer_reward_pending(organization_id, order_id, points, event_key) values(v_org, p_order_id, v_points - v_take, 'pending:' || v_key);
    end if;
  else
    insert into customer_personal_reward_accounts(user_id) values(v_user) on conflict do nothing;
    perform 1 from customer_personal_reward_accounts where user_id = v_user for update;
    v_balance := greatest(private.customer_personal_reward_balance(v_user), 0);
    v_take := least(v_points, v_balance); v_left := v_take;
    if v_take > 0 then
      for v_lot in select id, remaining_points from customer_personal_reward_entries
        where user_id = v_user and remaining_points > 0 and (expires_at is null or expires_at > now()) and (available_at is null or available_at <= now())
        order by expires_at nulls last, id for update loop
        exit when v_left = 0;
        update customer_personal_reward_entries set remaining_points = remaining_points - least(v_left, v_lot.remaining_points) where id = v_lot.id;
        v_left := v_left - least(v_left, v_lot.remaining_points);
      end loop;
      insert into customer_personal_reward_entries(user_id, points, remaining_points, kind, order_id, event_key)
        values(v_user, -v_take, 0, 'clawback', p_order_id, v_key);
    end if;
    if v_points > v_take then
      insert into customer_personal_reward_pending(user_id, order_id, points, event_key) values(v_user, p_order_id, v_points - v_take, 'pending:' || v_key);
    end if;
  end if;
end $$;

create or replace function public.customer_portal_ops_record_food_refund(p_order_id uuid, p_food numeric)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(true);
  perform private.customer_apply_food_refund(p_order_id, p_food);
end $$;

create or replace function private.customer_lunchbox_restore_stock()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.delivery_status in ('已取消','己取消','取消') and new.delivery_status is distinct from old.delivery_status
    and exists(select 1 from customer_personal_quotes where order_id = new.id and stock_restored_at is null) then
    update customer_lunchbox_items i
      set available_quantity = available_quantity + l.quantity::integer
      from customer_personal_quotes q
      join order_lines l on l.order_id = q.order_id and coalesce(l.is_void, false) = false
      where q.order_id = new.id and i.menu_id = q.menu_id and i.product_id = l.product_id;
    update customer_personal_quotes set stock_restored_at = now() where order_id = new.id and stock_restored_at is null;
  end if;
  return new;
end $$;
drop trigger if exists customer_lunchbox_restore_stock on public.orders;
create trigger customer_lunchbox_restore_stock after update of delivery_status on public.orders
  for each row execute function private.customer_lunchbox_restore_stock();

create or replace function public.customer_portal_export_orders()
returns text language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
begin
  perform private.customer_require_permission('export');
  return 'number,delivery,status,total' || coalesce((
    select string_agg(E'\n' || coalesce(live.order_number, '') || ',' || to_char(live.delivery_at at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD') || ',' || coalesce(live.delivery_status, '') || ',' || live.grand_total::text, '' order by live.created_at desc)
    from customer_portal_orders po
    join orders live on live.id = po.order_id
    where po.organization_id = v_org and live.archived_at is null
  ), '');
end $$;

create or replace function public.customer_award_external_completed_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_order orders%rowtype; v_user uuid; v_org uuid; v_food numeric; v_threshold numeric; v_points bigint; v_available timestamptz;
begin
  if to_regclass('public.customer_reward_rules') is null then return; end if;
  select * into v_order from orders where id = p_order_id and document_type = 'order' and archived_at is null
    and delivery_status in ('已送達','己送達','已取','已取貨');
  if v_order.id is null then return; end if;
  if exists(select 1 from customer_portal_orders where order_id = p_order_id)
    or exists(select 1 from customer_personal_quotes where order_id = p_order_id) then return; end if;
  v_food := greatest(coalesce(v_order.grand_total, 0) - coalesce(v_order.shipping_fee, 0), 0);
  select hkd_per_point into v_threshold from customer_reward_rules where effective_at <= now() order by effective_at desc limit 1;
  v_points := case when v_threshold is null or v_threshold <= 0 then 0 else floor(v_food / v_threshold)::bigint end;
  if v_points <= 0 then return; end if;
  v_available := private.customer_points_available_at(coalesce(v_order.delivery_at, now()));
  select user_id into v_user from private.customer_personal_order_links where order_id = p_order_id limit 1;
  if v_user is not null and not exists(select 1 from customer_personal_reward_entries where event_key = 'earn:' || p_order_id) then
    insert into customer_personal_reward_accounts(user_id) values(v_user) on conflict do nothing;
    insert into customer_personal_reward_entries(user_id, points, remaining_points, kind, order_id, event_key, available_at)
      values(v_user, v_points, v_points, 'earn', p_order_id, 'earn:' || p_order_id, v_available);
    return;
  end if;
  if v_order.customer_id is not null and (select count(*) from customer_organizations where customer_id = v_order.customer_id and is_active) = 1 then
    select id into v_org from customer_organizations where customer_id = v_order.customer_id and is_active;
    if not exists(select 1 from customer_reward_entries where event_key = 'earn:' || p_order_id) then
      insert into customer_reward_accounts(organization_id) values(v_org) on conflict do nothing;
      insert into customer_reward_entries(organization_id, points, remaining_points, kind, order_id, event_key, available_at)
        values(v_org, v_points, v_points, 'earn', p_order_id, 'earn:' || p_order_id, v_available);
    end if;
  end if;
end $$;
create or replace function public.customer_award_external_completed_order_trigger()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  perform public.customer_award_external_completed_order(new.id);
  return new;
end $$;
drop trigger if exists customer_external_order_points on public.orders;
create trigger customer_external_order_points after update of delivery_status on public.orders
  for each row when (new.delivery_status is distinct from old.delivery_status)
  execute function public.customer_award_external_completed_order_trigger();

create or replace function public.customer_personal_reorder_as_quote(p_order_id uuid, p_request_id uuid, p_address_id uuid)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_uid uuid := private.customer_personal_user(); v_menu uuid; v_items jsonb; v_address uuid := p_address_id;
begin
  if not exists(select 1 from customer_personal_quotes where order_id = p_order_id and user_id = v_uid) then
    raise exception 'not_portal_quote';
  end if;
  select menu_id into v_menu from customer_personal_quotes where order_id = p_order_id;
  if v_address is null then
    select id into v_address from private.customer_personal_addresses where user_id = v_uid order by is_default desc, created_at limit 1;
  end if;
  select jsonb_agg(jsonb_build_object('product_id', l.product_id, 'quantity', l.quantity::integer)) into v_items
    from order_lines l where l.order_id = p_order_id and coalesce(l.is_void, false) = false and l.product_id is not null and l.quantity > 0;
  if v_items is null then raise exception 'menu_unavailable'; end if;
  return public.customer_personal_submit_lunchbox(p_request_id, v_menu, v_address, v_items);
end $$;

revoke all on function public.customer_portal_ops_list_point_holidays() from public, anon;
revoke all on function public.customer_portal_ops_set_point_holiday(date, text, boolean) from public, anon;
revoke all on function public.customer_portal_ops_record_food_refund(uuid, numeric) from public, anon;
revoke all on function public.customer_portal_export_orders() from public, anon;
revoke all on function public.customer_personal_reorder_as_quote(uuid, uuid, uuid) from public, anon;
grant execute on function public.customer_portal_ops_list_point_holidays() to authenticated;
grant execute on function public.customer_portal_ops_set_point_holiday(date, text, boolean) to authenticated;
grant execute on function public.customer_portal_ops_record_food_refund(uuid, numeric) to authenticated;
grant execute on function public.customer_portal_export_orders() to authenticated;
grant execute on function public.customer_personal_reorder_as_quote(uuid, uuid, uuid) to authenticated;
