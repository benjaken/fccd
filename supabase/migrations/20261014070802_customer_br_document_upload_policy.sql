-- The BR bucket exists, but the development database never received the insert
-- policy. Storage RLS then rejects every upload with a row-level security error.
create or replace function private.customer_br_upload_allowed(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_parts text[] := string_to_array(coalesce(p_path,''),'/');
begin
  if array_length(v_parts,1)<>3 or v_parts[1] is distinct from auth.uid()::text
    or v_parts[3] !~ '^[A-Za-z0-9._-]{1,120}$' or lower(v_parts[3]) !~ '\.(jpg|jpeg|png|pdf)$' then
    return false;
  end if;
  return exists(
    select 1 from customer_organization_applications
    where id::text=v_parts[2] and applicant_user_id=auth.uid() and status in ('draft','needs_info')
  ) or (
    (private.has_page_access('settings.customer_portal.edit') or private.has_page_manage('settings.customer_portal'))
    and exists(select 1 from customer_organizations where id::text=v_parts[2])
  );
end $$;
revoke all on function private.customer_br_upload_allowed(text) from public, anon;
grant execute on function private.customer_br_upload_allowed(text) to authenticated;

create or replace function private.customer_br_read_allowed(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_parts text[] := string_to_array(coalesce(p_path,''),'/');
begin
  if array_length(v_parts,1)<>3 then return false; end if;
  return v_parts[1]=auth.uid()::text
    or private.has_page_access('settings.customer_portal')
    or private.has_page_manage('settings.customer_portal');
end $$;
revoke all on function private.customer_br_read_allowed(text) from public, anon;
grant execute on function private.customer_br_read_allowed(text) to authenticated;

create or replace function private.customer_br_object_mutable(p_path text)
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $$
  select private.customer_br_upload_allowed(p_path)
    and not exists(select 1 from customer_organization_br_versions where object_path=p_path)
$$;
revoke all on function private.customer_br_object_mutable(text) from public, anon;
grant execute on function private.customer_br_object_mutable(text) to authenticated;

drop policy if exists "Customer BR document inserts" on storage.objects;
drop policy if exists "Customer BR document updates" on storage.objects;
drop policy if exists "Customer BR document reads" on storage.objects;
create policy "Customer BR document inserts" on storage.objects for insert to authenticated
  with check (bucket_id='customer-br-documents' and private.customer_br_upload_allowed(name));
create policy "Customer BR document updates" on storage.objects for update to authenticated
  using (bucket_id='customer-br-documents' and private.customer_br_object_mutable(name))
  with check (bucket_id='customer-br-documents' and private.customer_br_object_mutable(name));
create policy "Customer BR document reads" on storage.objects for select to authenticated
  using (bucket_id='customer-br-documents' and private.customer_br_read_allowed(name));
