-- Storage uploads carry an order path rather than the workspace RPC header.
-- Check the order's membership directly so another tab cannot invalidate a valid upload.
create or replace function private.customer_receipt_path_allowed(p_path text)
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $$
  select split_part(p_path,'/',1)=auth.uid()::text and array_length(string_to_array(p_path,'/'),1)=3
    and exists(select 1 from customer_portal_orders po
      join customer_memberships m on m.organization_id=po.organization_id and m.user_id=auth.uid() and m.is_active
      join customer_organizations o on o.id=m.organization_id and o.is_active
      join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
      where po.order_id::text=split_part(p_path,'/',2) and (m.role='admin' or coalesce(
        (select allowed from customer_org_member_permissions p where p.organization_id=m.organization_id and p.permission='orders'),true)))
$$;
