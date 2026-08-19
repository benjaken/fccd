-- Permission helper functions live in the private schema. Authenticated users
-- may execute the explicitly granted helpers, but PostgreSQL also requires
-- USAGE on their containing schema before invoker RPCs can call them.
grant usage on schema private to authenticated;
