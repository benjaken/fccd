-- 明記海鮮 already exists in the migrated supplier master, but was imported as
-- inactive. Reactivate the existing row so it appears in monthly supplier
-- record selectors without creating a duplicate supplier.
update public.suppliers
set is_active = true
where legacy_id = '1702286230436x745772646533693400'
  and company_name = '明記海鮮'
  and archived_at is null;
