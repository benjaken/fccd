update storage.buckets
set allowed_mime_types = array['application/pdf', 'application/json']::text[]
where id = 'supplier-quotes-private';

drop policy if exists "Supplier quote readers preview stored files" on storage.objects;
create policy "Supplier quote readers preview stored files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'supplier-quotes-private'
    and private.has_page_access('frozen.supplier_quotes')
  );
