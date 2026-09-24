-- Reduce business_notifications realtime chatter.
--
-- private.upsert_business_notification used to update the conflicting row on
-- every call, even when nothing actually changed. Because the table is part of
-- the supabase_realtime publication, every one of those no-op updates emitted a
-- change event, which made every open client re-run fetchNotifications(). The
-- hourly refresh_due_notifications job alone touched every due reminder once an
-- hour, so the API saw a burst of identical requests.
--
-- This migration keeps the exact same upsert semantics but only writes when the
-- resulting row would differ from the stored one.

create or replace function private.upsert_business_notification(
  p_recipient_user_id uuid,
  p_dedupe_key text,
  p_event_type text,
  p_category text,
  p_priority text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_route text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_recipient_user_id is null then return null; end if;

  insert into public.business_notifications (
    recipient_user_id, dedupe_key, event_type, category, priority,
    title, body, entity_type, entity_id, route, metadata
  ) values (
    p_recipient_user_id, p_dedupe_key, p_event_type, p_category, p_priority,
    p_title, p_body, p_entity_type, p_entity_id, p_route, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (dedupe_key, recipient_user_id) do update
  set event_type = excluded.event_type,
      category = excluded.category,
      priority = excluded.priority,
      title = excluded.title,
      body = excluded.body,
      entity_type = excluded.entity_type,
      entity_id = excluded.entity_id,
      route = excluded.route,
      metadata = public.business_notifications.metadata || excluded.metadata,
      read_at = case
        when excluded.event_type in ('quote_due', 'factory_unsent', 'delivered_unpaid', 'delivery_attention')
          and public.business_notifications.metadata ->> 'stage'
            is not distinct from excluded.metadata ->> 'stage'
        then public.business_notifications.read_at
        else null
      end,
      snoozed_until = case
        when excluded.event_type in ('quote_due', 'factory_unsent', 'delivered_unpaid', 'delivery_attention')
          and public.business_notifications.metadata ->> 'stage'
            is not distinct from excluded.metadata ->> 'stage'
        then public.business_notifications.snoozed_until
        else null
      end,
      resolved_at = null,
      updated_at = now()
  where
    public.business_notifications.event_type is distinct from excluded.event_type
    or public.business_notifications.category is distinct from excluded.category
    or public.business_notifications.priority is distinct from excluded.priority
    or public.business_notifications.title is distinct from excluded.title
    or public.business_notifications.body is distinct from excluded.body
    or public.business_notifications.entity_type is distinct from excluded.entity_type
    or public.business_notifications.entity_id is distinct from excluded.entity_id
    or public.business_notifications.route is distinct from excluded.route
    or public.business_notifications.metadata
         is distinct from (public.business_notifications.metadata || excluded.metadata)
    or public.business_notifications.resolved_at is not null
    or public.business_notifications.read_at is distinct from (
         case
           when excluded.event_type in ('quote_due', 'factory_unsent', 'delivered_unpaid', 'delivery_attention')
             and public.business_notifications.metadata ->> 'stage'
               is not distinct from excluded.metadata ->> 'stage'
           then public.business_notifications.read_at
           else null
         end
       )
    or public.business_notifications.snoozed_until is distinct from (
         case
           when excluded.event_type in ('quote_due', 'factory_unsent', 'delivered_unpaid', 'delivery_attention')
             and public.business_notifications.metadata ->> 'stage'
               is not distinct from excluded.metadata ->> 'stage'
           then public.business_notifications.snoozed_until
           else null
         end
       )
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.business_notifications
    where dedupe_key = p_dedupe_key and recipient_user_id = p_recipient_user_id;
  end if;

  return v_id;
end;
$$;
