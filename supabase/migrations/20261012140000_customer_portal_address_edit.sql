-- Organization members can update and soft-delete (archive) their delivery addresses.
create or replace function public.customer_portal_update_address(
  p_id uuid, p_label text, p_recipient text, p_phone text, p_address text
)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization();
begin
  if p_id is null or length(btrim(p_label)) not between 1 and 80 or length(btrim(p_recipient)) not between 1 and 100
    or length(btrim(p_address)) not between 5 and 500 or p_phone !~ '^\+?[0-9 -]{8,20}$'
    or p_label is null or p_recipient is null or p_address is null or p_phone is null then
    raise exception 'invalid_address';
  end if;
  update customer_addresses
    set label=btrim(p_label), recipient=btrim(p_recipient), phone=p_phone, address=btrim(p_address)
    where id=p_id and organization_id=v_org and archived_at is null;
  if not found then raise exception 'address_required'; end if;
end $$;

create or replace function public.customer_portal_archive_address(p_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization();
begin
  if p_id is null then raise exception 'address_required'; end if;
  update customer_addresses set archived_at=now()
    where id=p_id and organization_id=v_org and archived_at is null;
  if not found then raise exception 'address_required'; end if;
end $$;

do $$ declare signature text; begin
  foreach signature in array array[
    'customer_portal_update_address(uuid,text,text,text,text)',
    'customer_portal_archive_address(uuid)'
  ] loop
    execute 'revoke all on function public.'||signature||' from public,anon';
    execute 'grant execute on function public.'||signature||' to authenticated';
  end loop;
end $$;
