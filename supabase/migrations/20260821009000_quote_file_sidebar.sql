-- Quote users can upload and read files owned by quotes in the existing private
-- attachment bucket. Other attachment records retain their settings-only RLS.
grant select, insert on table public.attachments to authenticated;

drop policy if exists "Quote users read quote file metadata"
on public.quote_file_metadata;
create policy "Quote users read quote file metadata"
on public.quote_file_metadata
for select
to authenticated
using (private.has_page_access('quotes'));

drop policy if exists "Quote users read quote attachments"
on public.attachments;
create policy "Quote users read quote attachments"
on public.attachments
for select
to authenticated
using (
  private.has_page_access('quotes')
  and (
    (owner_type = 'order' and owner_id in (
      select id from public.orders where document_type = 'quote'
    ))
    or source_type = 'quote_file'
  )
);

drop policy if exists "Quote users register quote uploads"
on public.attachments;
create policy "Quote users register quote uploads"
on public.attachments
for insert
to authenticated
with check (
  private.has_page_access('quotes')
  and source_type = 'quote_upload'
  and source_field = 'quote.file'
  and owner_type = 'order'
  and owner_id in (
    select id from public.orders where document_type = 'quote'
  )
  and bucket_id = 'attachments'
  and object_path like ('quotes/' || owner_id::text || '/%')
  and migration_mode = 'incremental'
  and migration_status = 'verified'
);

drop policy if exists "Quote users read quote file objects"
on storage.objects;
create policy "Quote users read quote file objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'attachments'
  and private.has_page_access('quotes')
  and (
    name like 'quotes/%'
    or exists (
      select 1
      from public.attachments attachment
      left join public.quote_file_metadata metadata
        on metadata.legacy_id = attachment.source_legacy_row_id
      where attachment.bucket_id = storage.objects.bucket_id
        and attachment.object_path = storage.objects.name
        and (
          attachment.owner_id in (
            select id from public.orders where document_type = 'quote'
          )
          or metadata.order_id in (
            select id from public.orders where document_type = 'quote'
          )
        )
    )
  )
);

drop policy if exists "Quote users upload quote file objects"
on storage.objects;
create policy "Quote users upload quote file objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'attachments'
  and private.has_page_access('quotes')
  and name like 'quotes/%'
);

drop policy if exists "Quote users remove failed quote uploads"
on storage.objects;
create policy "Quote users remove failed quote uploads"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'attachments'
  and private.has_page_access('quotes')
  and name like 'quotes/%'
);
