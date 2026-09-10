-- Allow quote managers to delete quote attachment rows and matching Bubble
-- metadata after removing the private storage object from the sidebar.
-- Storage delete for quotes/% already exists for upload rollback.
grant delete on table public.attachments to authenticated;

drop policy if exists "Quote managers delete quote attachments"
on public.attachments;
create policy "Quote managers delete quote attachments"
on public.attachments
for delete
to authenticated
using (
  private.has_page_manage('quotes')
  and (
    (
      owner_type = 'order'
      and owner_id in (
        select id from public.orders where document_type = 'quote'
      )
    )
    or source_type in ('quote_file', 'quote_upload')
  )
);

drop policy if exists "Quote managers delete quote file metadata"
on public.quote_file_metadata;
create policy "Quote managers delete quote file metadata"
on public.quote_file_metadata
for delete
to authenticated
using (
  private.has_page_manage('quotes')
  and (
    order_id is null
    or order_id in (
      select id from public.orders where document_type = 'quote'
    )
  )
);
