-- Staff can remove unused customer-ops records. Rows already tied to orders or redemptions stay.

create or replace function public.customer_portal_ops_delete_guide(p_slug text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.customer_portal_ops_require(true);
  delete from public.customer_portal_guides where slug = p_slug;
  if not found then
    raise exception 'guide_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.customer_portal_ops_delete_lunchbox(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.customer_portal_ops_require(true);
  if p_id is null or not exists (select 1 from public.customer_lunchbox_menus where id = p_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.customer_personal_quotes where menu_id = p_id)
    or exists (select 1 from public.customer_portal_orders where lunchbox_menu_id = p_id) then
    raise exception 'in_use' using errcode = 'P0001';
  end if;
  delete from public.customer_lunchbox_items where menu_id = p_id;
  delete from public.customer_lunchbox_menus where id = p_id;
end;
$$;

create or replace function public.customer_portal_ops_delete_reward_catalog(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.customer_portal_ops_require(true);
  if p_id is null or not exists (select 1 from public.customer_reward_catalog where id = p_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.customer_reward_catalog_redemptions where catalog_id = p_id) then
    raise exception 'in_use' using errcode = 'P0001';
  end if;
  delete from public.customer_reward_catalog where id = p_id;
end;
$$;

create or replace function public.customer_portal_ops_delete_org(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.customer_portal_ops_require(true);
  if p_id is null or not exists (select 1 from public.customer_organizations where id = p_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.customer_portal_orders where organization_id = p_id)
    or exists (select 1 from public.customer_reward_entries where organization_id = p_id)
    or exists (select 1 from public.customer_reward_catalog_redemptions where organization_id = p_id)
    or exists (select 1 from public.customer_payment_evidence where organization_id = p_id)
    or exists (select 1 from public.customer_cancel_requests where organization_id = p_id)
    or exists (select 1 from public.customer_organization_applications where organization_id = p_id) then
    raise exception 'in_use' using errcode = 'P0001';
  end if;
  delete from public.customer_menu_items
    where menu_id in (select id from public.customer_menu_assignments where organization_id = p_id);
  delete from public.customer_member_menu_scopes where organization_id = p_id;
  delete from public.customer_menu_assignments where organization_id = p_id;
  delete from public.customer_org_member_permissions where organization_id = p_id;
  delete from public.customer_order_template_items
    where template_id in (select id from public.customer_order_templates where organization_id = p_id);
  delete from public.customer_order_templates where organization_id = p_id;
  delete from public.customer_invitations where organization_id = p_id;
  delete from public.customer_addresses where organization_id = p_id;
  delete from public.customer_memberships where organization_id = p_id;
  delete from public.customer_reward_accounts where organization_id = p_id;
  delete from public.customer_vip_batch_orders
    where batch_id in (select id from public.customer_vip_batches where organization_id = p_id);
  delete from public.customer_vip_batches where organization_id = p_id;
  delete from public.customer_organizations where id = p_id;
end;
$$;

revoke all on function public.customer_portal_ops_delete_guide(text) from public, anon;
revoke all on function public.customer_portal_ops_delete_lunchbox(uuid) from public, anon;
revoke all on function public.customer_portal_ops_delete_reward_catalog(uuid) from public, anon;
revoke all on function public.customer_portal_ops_delete_org(uuid) from public, anon;
grant execute on function public.customer_portal_ops_delete_guide(text) to authenticated;
grant execute on function public.customer_portal_ops_delete_lunchbox(uuid) to authenticated;
grant execute on function public.customer_portal_ops_delete_reward_catalog(uuid) to authenticated;
grant execute on function public.customer_portal_ops_delete_org(uuid) to authenticated;
