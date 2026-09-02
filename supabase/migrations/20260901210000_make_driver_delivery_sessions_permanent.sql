-- Driver portal sessions remain valid until the fleet signs out or operations
-- disables its driver-panel access. PostgreSQL's timestamptz infinity keeps the
-- existing session validation predicates compatible without a time limit.

alter table private.driver_delivery_sessions
  alter column expires_at set default 'infinity'::timestamptz;

update private.driver_delivery_sessions
set expires_at = 'infinity'::timestamptz
where expires_at <> 'infinity'::timestamptz;

comment on column private.driver_delivery_sessions.expires_at is
  'Permanent driver portal session marker; infinity means valid until explicit revocation.';
