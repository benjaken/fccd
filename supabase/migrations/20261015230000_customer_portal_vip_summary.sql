-- Organization home cycle summary. Admins see the team counts and the cycle
-- total; members see their own order status for the open VIP lunch cycle.

create or replace function public.customer_portal_vip_summary()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
  v_cycle uuid; v_name text; v_cutoff timestamptz;
  v_admin boolean := private.customer_is_admin();
  v_show boolean := private.customer_prices_visible();
begin
  if to_regprocedure('private.customer_require_permission(text)') is not null then
    execute 'select private.customer_require_permission(''ordering'')';
  end if;
  select id, name, cutoff_at into v_cycle, v_name, v_cutoff
    from customer_vip_cycles where is_active and cutoff_at > now() order by cutoff_at, name limit 1;
  if v_cycle is null then return 'null'::jsonb; end if;
  return jsonb_build_object(
    'cycle_id', v_cycle, 'cycle_name', v_name, 'cutoff_at', v_cutoff,
    'members', case when v_admin
      then (select count(*)::int from customer_memberships m where m.organization_id = v_org and m.is_active) end,
    'ordered', case when v_admin
      then (select count(distinct b.user_id)::int from customer_vip_batches b where b.organization_id = v_org and b.cycle_id = v_cycle) end,
    'amount', case when v_admin and v_show then coalesce((
      select sum(o.grand_total) from customer_vip_batches b
      join customer_vip_batch_orders bo on bo.batch_id = b.id
      join orders o on o.id = bo.order_id and o.archived_at is null
      where b.organization_id = v_org and b.cycle_id = v_cycle
    ), 0) end,
    'me', jsonb_build_object(
      'ordered', exists(select 1 from customer_vip_batches b
        where b.organization_id = v_org and b.cycle_id = v_cycle and b.user_id = auth.uid()),
      'amount', case when v_show then coalesce((
        select sum(o.grand_total) from customer_vip_batches b
        join customer_vip_batch_orders bo on bo.batch_id = b.id
        join orders o on o.id = bo.order_id and o.archived_at is null
        where b.organization_id = v_org and b.cycle_id = v_cycle and b.user_id = auth.uid()
      ), 0) end
    )
  );
end $$;
revoke all on function public.customer_portal_vip_summary() from public, anon;
grant execute on function public.customer_portal_vip_summary() to authenticated;
