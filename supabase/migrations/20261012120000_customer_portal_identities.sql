-- Only verified server-side membership determines which workspaces can be selected.
create or replace function public.customer_portal_identities()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_organization text;
begin
  if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null)
    then raise exception 'email_verification_required' using errcode='42501'; end if;
  select o.name into v_organization from customer_memberships m
    join customer_organizations o on o.id=m.organization_id and o.is_active
    where m.user_id=v_user and m.is_active;
  return jsonb_build_object('personal',true,'organization',v_organization is not null,'organizationName',v_organization);
end $$;
revoke all on function public.customer_portal_identities() from public,anon;
grant execute on function public.customer_portal_identities() to authenticated;
