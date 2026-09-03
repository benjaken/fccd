-- Allow quotes managers to delete unused enquiry forms and unconverted submissions.

grant delete on public.enquiry_forms to authenticated;
grant delete on public.enquiry_submissions to authenticated;

drop policy if exists "Quotes managers delete enquiry submissions" on public.enquiry_submissions;
create policy "Quotes managers delete enquiry submissions"
  on public.enquiry_submissions for delete to authenticated
  using (
    private.has_page_manage('quotes')
    and converted_quote_id is null
  );
