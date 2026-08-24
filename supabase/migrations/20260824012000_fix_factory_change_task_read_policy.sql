-- The shared role helper is intentionally not executable by authenticated
-- clients. RLS policies must therefore inspect the JWT claim directly instead
-- of invoking the private helper, which PostgREST reports as HTTP 403.

drop policy if exists factory_change_tasks_read
  on public.factory_change_tasks;

create policy factory_change_tasks_read
on public.factory_change_tasks
for select
to authenticated
using (
  nullif((select auth.jwt()) -> 'app_metadata' ->> 'role', '')
    in ('Super Admin', 'Admin', 'Factory')
);
