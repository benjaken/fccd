-- Read-only company profile for the organization the customer currently has selected.
-- The BR file path stays on the application record and is not returned here.
create or replace function public.customer_portal_company()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
begin
  return jsonb_build_object(
    'name', (select name from customer_organizations where id=v_org),
    'brNumber', coalesce((select br_number from customer_organizations where id=v_org), ''),
    'brExpiresOn', (select br_expires_on from customer_organizations where id=v_org),
    'settlementCycle', (select settlement_cycle from customer_organizations where id=v_org),
    'contacts', coalesce((select jsonb_agg(jsonb_build_object(
      'name', c.name, 'phone', c.phone, 'title', c.title, 'primary', c.is_primary
    ) order by c.is_primary desc, c.created_at)
      from customer_organization_contacts c where c.organization_id=v_org), '[]'::jsonb)
  );
end $$;
revoke all on function public.customer_portal_company() from public, anon;
grant execute on function public.customer_portal_company() to authenticated;
