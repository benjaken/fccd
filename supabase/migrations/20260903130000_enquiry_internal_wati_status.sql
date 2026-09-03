-- Track internal WhatsApp (WATI) separately from internal enquiry email.

alter table public.enquiry_submissions
  add column if not exists internal_wati_status text not null default 'not_sent';

alter table public.enquiry_submissions
  drop constraint if exists enquiry_submissions_internal_wati_status_check;

alter table public.enquiry_submissions
  add constraint enquiry_submissions_internal_wati_status_check
  check (internal_wati_status = any (array[
    'not_sent'::text,
    'sending'::text,
    'sent'::text,
    'failed'::text
  ]));
