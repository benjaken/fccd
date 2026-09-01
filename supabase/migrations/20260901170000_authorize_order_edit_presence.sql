-- The editing indicator is ephemeral connection state, so Presence is the
-- source of truth. Restrict the channel to signed-in application users.

drop policy if exists "authenticated users can read order edit presence"
  on realtime.messages;
create policy "authenticated users can read order edit presence"
on realtime.messages
for select
to authenticated
using (
  (select realtime.topic()) = 'order-edit-presence-v1'
  and realtime.messages.extension = 'presence'
);

drop policy if exists "authenticated users can track order edit presence"
  on realtime.messages;
create policy "authenticated users can track order edit presence"
on realtime.messages
for insert
to authenticated
with check (
  (select realtime.topic()) = 'order-edit-presence-v1'
  and realtime.messages.extension = 'presence'
);
