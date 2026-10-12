-- Keep portal auth failures as raise_exception so PostgREST returns the business code.
create or replace function private.customer_organization(p_admin boolean default false)
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  select m.organization_id into v_id from public.customer_memberships m
  join public.customer_organizations o on o.id=m.organization_id and o.is_active
  join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
  where m.user_id=auth.uid() and m.is_active and (not p_admin or m.role='admin');
  if v_id is null then raise exception 'customer_membership_required' using errcode='P0001'; end if;
  return v_id;
end $$;

create or replace function public.customer_portal_identities()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_organization text;
begin
  if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null)
    then raise exception 'email_verification_required' using errcode='P0001'; end if;
  select o.name into v_organization from customer_memberships m
    join customer_organizations o on o.id=m.organization_id and o.is_active
    where m.user_id=v_user and m.is_active;
  return jsonb_build_object('personal',true,'organization',v_organization is not null,'organizationName',v_organization);
end $$;
