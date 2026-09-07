alter table public.enquiry_submissions
  add column if not exists asana_task_gid text,
  add column if not exists asana_error text;

comment on column public.enquiry_submissions.asana_task_gid is
  'Asana task GID created for the confirmed order originating from this enquiry.';

comment on column public.enquiry_submissions.asana_error is
  'Sanitized latest Asana creation error. Never contains the access token.';
