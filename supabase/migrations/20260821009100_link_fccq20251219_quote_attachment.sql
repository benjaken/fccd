-- The file bytes were migrated through Bubble's uploaded-files registry, while
-- the quote metadata was migrated separately. Restore the missing ownership
-- edge so the quote file sidebar can resolve the verified private object.
update public.attachments
set
  owner_type = 'order',
  owner_id = '928af9ba-28b6-4f00-9a49-8c416731ec76'::uuid,
  owner_legacy_id = '1767080266730x473076916134346750',
  updated_at = now()
where id = '48c58a49-83ec-444d-9f8e-714cd7dc28e1'::uuid
  and source_type = 'bubble_uploaded_file'
  and source_legacy_row_id = '1767081442955x179420181620797000'
  and original_filename = 'FCCQ20251219.pdf'
  and migration_status = 'verified'
  and exists (
    select 1
    from public.orders
    where id = '928af9ba-28b6-4f00-9a49-8c416731ec76'::uuid
      and legacy_id = '1767080266730x473076916134346750'
      and order_number = 'FCCQ20251219'
      and document_type = 'quote'
  );
