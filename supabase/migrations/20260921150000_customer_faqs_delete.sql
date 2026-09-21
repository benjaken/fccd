begin;

-- The FAQ editor could create and update knowledge rows but never remove a bad
-- or obsolete one. Deleting cascades to the FAQ embedding tables and nulls the
-- learning-suggestion / turn-feedback references, so it is safe at the schema
-- level; only the missing grant and policy blocked it.
grant delete on table public.customer_faqs to authenticated;

drop policy if exists "Customer FAQ editors delete" on public.customer_faqs;
create policy "Customer FAQ editors delete"
on public.customer_faqs
for delete to authenticated
using (private.has_page_access('settings.customer_faq.edit'));

commit;
