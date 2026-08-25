begin;

create or replace function private.sync_catalog_status_and_active()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is null or btrim(new.status) = '' then
      new.status := case when new.is_active then 'Active' else 'Inactive' end;
    else
      new.is_active := new.status = 'Active';
    end if;
  elsif new.status is distinct from old.status then
    if new.status is null or btrim(new.status) = '' then
      new.status := case when new.is_active then 'Active' else 'Inactive' end;
    else
      new.is_active := new.status = 'Active';
    end if;
  elsif new.is_active is distinct from old.is_active then
    new.status := case when new.is_active then 'Active' else 'Inactive' end;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_catalog_status_and_active() from public;

drop trigger if exists sync_product_catalog_status_and_active
  on public.products;
create trigger sync_product_catalog_status_and_active
before insert or update of status, is_active on public.products
for each row execute function private.sync_catalog_status_and_active();

drop trigger if exists sync_package_catalog_status_and_active
  on public.packages;
create trigger sync_package_catalog_status_and_active
before insert or update of status, is_active on public.packages
for each row execute function private.sync_catalog_status_and_active();

-- Preserve explicit legacy Inactive values, whose boolean column was left at
-- its default true during migration. For the inverse mismatch, is_active is
-- the newer operational value (including Shopify approvals), so align status.
update public.products
set is_active = false, updated_at = now()
where status = 'Inactive' and is_active;

update public.packages
set is_active = false, updated_at = now()
where status = 'Inactive' and is_active;

update public.products
set status = 'Inactive', updated_at = now()
where status = 'Active' and not is_active;

update public.packages
set status = 'Inactive', updated_at = now()
where status = 'Active' and not is_active;

commit;
