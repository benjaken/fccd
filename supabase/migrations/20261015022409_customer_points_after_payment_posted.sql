-- Points wait until the order is both completed and posted.
-- A posted order has a positive total covered by active payments, or Shopify has marked it paid.

create or replace function private.customer_order_payment_posted(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.document_type = 'order'
      and o.archived_at is null
      and coalesce(o.grand_total, 0) > 0
      and (
        (
          o.payment_status_source = 'shopify'
          and lower(coalesce(o.shopify_financial_status, '')) = 'paid'
        )
        or coalesce((
          select sum(p.amount)
          from public.payments p
          where p.order_id = o.id
            and p.voided_at is null
        ), 0) >= coalesce(o.grand_total, 0)
      )
  );
$$;
revoke all on function private.customer_order_payment_posted(uuid) from public, anon, authenticated;

create or replace function private.customer_release_unposted_points(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if private.customer_order_payment_posted(p_order_id) then return; end if;
  delete from public.customer_personal_reward_entries
    where event_key = 'earn:' || p_order_id and kind = 'earn' and available_at > now();
  if not exists (
    select 1 from public.customer_personal_reward_entries
    where event_key = 'earn:' || p_order_id and kind = 'earn'
  ) then
    update public.customer_personal_quotes
      set earned_at = null
      where order_id = p_order_id and earned_at is not null;
  end if;
  delete from public.customer_reward_entries
    where event_key = 'earn:' || p_order_id and kind = 'earn' and available_at > now();
  if not exists (
    select 1 from public.customer_reward_entries
    where event_key = 'earn:' || p_order_id and kind = 'earn'
  ) then
    update public.customer_portal_orders
      set earned_at = null
      where order_id = p_order_id and earned_at is not null;
  end if;
end $$;
revoke all on function private.customer_release_unposted_points(uuid) from public, anon, authenticated;

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
  if not private.customer_order_payment_posted(p_order_id) then return; end if;
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
  if not private.customer_order_payment_posted(p_order_id) then return; end if;
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
  if not private.customer_order_payment_posted(p_order_id) then return; end if;
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

create or replace function private.customer_award_settled_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if p_order_id is null then return; end if;
  if private.customer_order_payment_posted(p_order_id) then
    perform public.customer_portal_award_completed_order(p_order_id);
    perform public.customer_personal_award_completed_order(p_order_id);
    perform public.customer_award_external_completed_order(p_order_id);
  else
    perform private.customer_release_unposted_points(p_order_id);
  end if;
end $$;
revoke all on function private.customer_award_settled_order(uuid) from public, anon, authenticated;

create or replace function private.customer_points_payment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform private.customer_award_settled_order(old.order_id);
  end if;
  perform private.customer_award_settled_order(case when tg_op = 'DELETE' then old.order_id else new.order_id end);
  return coalesce(new, old);
end $$;
revoke all on function private.customer_points_payment_trigger() from public, anon, authenticated;

drop trigger if exists customer_points_on_payment on public.payments;
create trigger customer_points_on_payment
after insert or delete or update of order_id, amount, voided_at
on public.payments
for each row execute function private.customer_points_payment_trigger();

create or replace function private.customer_points_shopify_paid_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.customer_award_settled_order(new.id);
  return new;
end $$;
revoke all on function private.customer_points_shopify_paid_trigger() from public, anon, authenticated;

drop trigger if exists customer_points_on_shopify_paid on public.orders;
create trigger customer_points_on_shopify_paid
after update of shopify_financial_status on public.orders
for each row
when (new.shopify_financial_status is distinct from old.shopify_financial_status)
execute function private.customer_points_shopify_paid_trigger();
