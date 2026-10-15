-- Organization delivery addresses gain a default flag, mirroring the personal
-- customer address book so phones can add, review and set a default address.
alter table public.customer_addresses add column is_default boolean not null default false;

-- Seed one default per organization that already has active addresses.
update public.customer_addresses a set is_default = true
  where a.archived_at is null
    and a.id = (
      select b.id from public.customer_addresses b
      where b.organization_id = a.organization_id and b.archived_at is null
      order by b.created_at, b.id
      limit 1
    );

create unique index customer_addresses_one_default
  on public.customer_addresses(organization_id)
  where is_default and archived_at is null;

drop function if exists public.customer_portal_save_address(text, text, text, text);
create function public.customer_portal_save_address(
  p_label text, p_recipient text, p_phone text, p_address text, p_is_default boolean default false
)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization(); v_id uuid; v_default boolean;
begin
  perform private.customer_require_permission('delivery');
  if length(btrim(p_label)) not between 1 and 80 or length(btrim(p_recipient)) not between 1 and 120
    or length(btrim(p_address)) not between 5 and 1000 or p_phone !~ '^\+?[0-9 -]{8,20}$'
    or p_label is null or p_recipient is null or p_address is null or p_phone is null then
    raise exception 'invalid_address';
  end if;
  perform 1 from customer_organizations where id = v_org for update;
  v_default := coalesce(p_is_default, false)
    or not exists (select 1 from customer_addresses where organization_id = v_org and archived_at is null);
  if v_default then
    update customer_addresses set is_default = false
      where organization_id = v_org and is_default and archived_at is null;
  end if;
  insert into customer_addresses(organization_id, label, recipient, phone, address, created_by, is_default)
    values (v_org, btrim(p_label), btrim(p_recipient), p_phone, btrim(p_address), auth.uid(), v_default)
    returning id into v_id;
  perform private.enqueue_customer_address_sync('organization', v_org, v_id, 'upsert');
  return v_id;
end $$;

drop function if exists public.customer_portal_update_address(uuid, text, text, text, text);
create function public.customer_portal_update_address(
  p_id uuid, p_label text, p_recipient text, p_phone text, p_address text, p_is_default boolean default false
)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
begin
  perform private.customer_require_permission('delivery');
  if p_id is null or length(btrim(p_label)) not between 1 and 80 or length(btrim(p_recipient)) not between 1 and 120
    or length(btrim(p_address)) not between 5 and 1000 or p_phone !~ '^\+?[0-9 -]{8,20}$'
    or p_label is null or p_recipient is null or p_address is null or p_phone is null then
    raise exception 'invalid_address';
  end if;
  if not exists (
    select 1 from customer_addresses where id = p_id and organization_id = v_org and archived_at is null
  ) then raise exception 'address_required'; end if;
  perform 1 from customer_organizations where id = v_org for update;
  if coalesce(p_is_default, false) then
    update customer_addresses set is_default = false
      where organization_id = v_org and is_default and archived_at is null and id <> p_id;
  end if;
  update customer_addresses
    set label = btrim(p_label), recipient = btrim(p_recipient), phone = p_phone, address = btrim(p_address),
        is_default = coalesce(p_is_default, false) or is_default
    where id = p_id and organization_id = v_org and archived_at is null;
  perform private.enqueue_customer_address_sync('organization', v_org, p_id, 'upsert');
end $$;

create or replace function public.customer_portal_archive_address(p_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid := private.customer_organization();
begin
  perform private.customer_require_permission('delivery');
  if p_id is null then raise exception 'address_required'; end if;
  perform 1 from customer_organizations where id = v_org for update;
  update customer_addresses set archived_at = now(), is_default = false
    where id = p_id and organization_id = v_org and archived_at is null;
  if not found then raise exception 'address_required'; end if;
  if not exists (
    select 1 from customer_addresses where organization_id = v_org and archived_at is null and is_default
  ) then
    update customer_addresses set is_default = true where id = (
      select id from customer_addresses where organization_id = v_org and archived_at is null
      order by created_at, id limit 1);
  end if;
  perform private.enqueue_customer_address_sync('organization', v_org, p_id, 'delete');
end $$;

-- The snapshot already serialises every column, so is_default flows to clients.
do $$ declare signature text; begin
  foreach signature in array array[
    'customer_portal_save_address(text,text,text,text,boolean)',
    'customer_portal_update_address(uuid,text,text,text,text,boolean)',
    'customer_portal_archive_address(uuid)'
  ] loop
    execute 'revoke all on function public.'||signature||' from public,anon';
    execute 'grant execute on function public.'||signature||' to authenticated';
  end loop;
end $$;
