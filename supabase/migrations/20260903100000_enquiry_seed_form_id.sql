-- Replace the placeholder seed form id with a normal UUID.

alter table public.enquiry_submissions
  drop constraint if exists enquiry_submissions_form_id_fkey;

update public.enquiry_forms
set id = '0d427475-b85a-4f6f-97c3-0c29b3d28025'
where id = '11111111-1111-4111-8111-111111111111';

update public.enquiry_submissions
set form_id = '0d427475-b85a-4f6f-97c3-0c29b3d28025'
where form_id = '11111111-1111-4111-8111-111111111111';

alter table public.enquiry_submissions
  add constraint enquiry_submissions_form_id_fkey
  foreign key (form_id) references public.enquiry_forms(id);
