-- Multi-organization membership uses P0001 for personal-only users. A permissive
-- organization Storage policy must return false instead of aborting personal uploads.
create or replace function private.customer_receipt_path_allowed(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid; v_parts text[]:=string_to_array(p_path,'/');
begin
  v_org:=private.customer_organization();
  return array_length(v_parts,1)=3 and v_parts[1]=auth.uid()::text and exists(
    select 1 from customer_portal_orders where organization_id=v_org and order_id::text=v_parts[2]);
exception
  when insufficient_privilege then return false;
  when raise_exception then
    if sqlerrm='customer_membership_required' then return false; end if;
    raise;
end $$;
