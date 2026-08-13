-- Allow admin password-change events in login activity log.
-- Also used when an administrator resets another user's password.

alter table public.login_logs
  drop constraint if exists login_logs_event_type_check;

alter table public.login_logs
  add constraint login_logs_event_type_check
  check (
    event_type in (
      'login_success',
      'login_failure',
      'logout',
      'password_reset_request',
      'password_change'
    )
  );

comment on column public.login_logs.event_type is
  'login_success | login_failure | logout | password_reset_request | password_change';
