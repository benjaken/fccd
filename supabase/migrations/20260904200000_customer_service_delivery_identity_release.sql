-- Durable WATI delivery tracking, order identity verification and auditable
-- model release rollback. This is a forward-only migration; migration history
-- is intentionally not repaired here.

create table if not exists public.customer_service_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  inbound_provider_message_id text not null,
  phone_normalized text not null,
  body text not null,
  local_message_id text not null unique,
  provider_message_id text,
  environment text not null default 'production',
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_retry_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inbound_provider_message_id)
);

create index if not exists customer_service_outbound_due_idx
  on public.customer_service_outbound_messages (next_retry_at, created_at)
  where status in ('queued', 'failed', 'sending');
create index if not exists customer_service_outbound_status_idx
  on public.customer_service_outbound_messages (environment, status, created_at desc);
create index if not exists customer_service_outbound_provider_idx
  on public.customer_service_outbound_messages (provider_message_id)
  where provider_message_id is not null;

alter table public.customer_service_outbound_messages enable row level security;
revoke all on table public.customer_service_outbound_messages from public, anon, authenticated;
grant all on table public.customer_service_outbound_messages to service_role;

create or replace function public.customer_service_outbound_claim(p_limit integer default 50)
returns setof public.customer_service_outbound_messages
language sql security definer set search_path = public
as $$
  update public.customer_service_outbound_messages message
  set status = 'sending',
      attempt_count = message.attempt_count + 1,
      last_attempt_at = now(),
      updated_at = now()
  where message.id in (
    select candidate.id
    from public.customer_service_outbound_messages candidate
    where candidate.next_retry_at <= now()
      and candidate.attempt_count < candidate.max_attempts
      and (
        candidate.status in ('queued', 'failed')
        or (candidate.status = 'sending' and candidate.updated_at < now() - interval '10 minutes')
      )
    order by candidate.next_retry_at, candidate.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  )
  returning message.*;
$$;

create or replace function public.customer_service_outbound_messages_list(
  p_status text default null,
  p_limit integer default 100
)
returns table (
  id uuid, phone_normalized text, body text, local_message_id text,
  provider_message_id text, environment text, status text, attempt_count integer,
  max_attempts integer, next_retry_at timestamptz, last_error text,
  sent_at timestamptz, delivered_at timestamptz, read_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
  select message.id, message.phone_normalized, message.body, message.local_message_id,
    message.provider_message_id, message.environment, message.status, message.attempt_count,
    message.max_attempts, message.next_retry_at, message.last_error,
    message.sent_at, message.delivered_at, message.read_at, message.created_at
  from public.customer_service_outbound_messages message
  where p_status is null or message.status = p_status
  order by case message.status when 'failed' then 0 when 'dead' then 1 when 'sending' then 2 else 3 end,
    message.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function public.customer_service_outbound_retry(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  update public.customer_service_outbound_messages
  set status = 'queued', attempt_count = 0, next_retry_at = now(),
      last_error = null, updated_at = now()
  where id = p_id and status in ('failed', 'dead');
  if not found then raise exception 'outbound_message_not_retryable' using errcode = '55000'; end if;
  return p_id;
end;
$$;

alter table public.customer_service_conversations
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_verification_method text,
  add column if not exists identity_verification_order_id uuid,
  add column if not exists identity_verification_attempts integer not null default 0;

alter table public.customer_service_conversations
  drop constraint if exists customer_service_conversations_state_check;
alter table public.customer_service_conversations
  add constraint customer_service_conversations_state_check
  check (state in (
    'identifying', 'verifying_order', 'picking_order', 'picking_handoff_order',
    'collecting', 'awaiting_human', 'human_owned'
  ));

create or replace function public.customer_service_verify_order_identity(
  p_phone text,
  p_order_id uuid,
  p_email text
)
returns boolean
language plpgsql security definer set search_path = public, private
as $$
declare
  v_phone text := private.self_service_phone(p_phone);
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if length(coalesce(v_phone, '')) < 8 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    return false;
  end if;
  return exists (
    select 1 from public.orders orders
    where orders.id = p_order_id
      and orders.document_type = 'order'
      and orders.archived_at is null
      and lower(btrim(coalesce(orders.email_snapshot, ''))) = v_email
      and (
        private.self_service_phone(orders.contact_number_a_snapshot) = v_phone
        or private.self_service_phone(orders.contact_number_b_snapshot) = v_phone
      )
  );
end;
$$;

create or replace function public.customer_service_conversation_set_mode(
  p_phone text,
  p_mode text
)
returns text
language plpgsql security definer set search_path = public, private
as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if v_phone = '' or p_mode not in ('human', 'bot') then
    raise exception 'invalid_conversation_mode' using errcode = '22023';
  end if;
  insert into public.customer_service_conversations (
    phone_normalized, state, selected_order_id, handoff_at, pending_request,
    identity_verified_at, identity_verification_method,
    identity_verification_order_id, identity_verification_attempts, updated_at
  ) values (
    v_phone, case when p_mode = 'human' then 'human_owned' else 'identifying' end,
    null, case when p_mode = 'human' then now() else null end, null,
    null, null, null, 0, now()
  )
  on conflict (phone_normalized) do update set
    state = excluded.state, selected_order_id = null,
    handoff_at = excluded.handoff_at, pending_request = null,
    identity_verified_at = null, identity_verification_method = null,
    identity_verification_order_id = null, identity_verification_attempts = 0,
    updated_at = now();
  if p_mode = 'human' then
    update public.customer_service_handoff_requests
    set status = 'in_progress', claimed_at = now(), claimed_by = auth.uid(), updated_at = now()
    where phone_normalized = v_phone and status in ('pending', 'processing', 'notified', 'failed');
  else
    update public.customer_service_handoff_requests
    set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
    where phone_normalized = v_phone and status in ('pending', 'processing', 'notified', 'in_progress', 'failed');
  end if;
  return p_mode;
end;
$$;

create table if not exists public.customer_service_config_release_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  action text not null check (action in ('activate', 'rollback')),
  from_config_id uuid references public.customer_service_config_versions(id) on delete set null,
  to_config_id uuid not null references public.customer_service_config_versions(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.customer_service_config_release_events enable row level security;
revoke all on table public.customer_service_config_release_events from public, anon, authenticated;
grant all on table public.customer_service_config_release_events to service_role;

create or replace function public.customer_service_config_release(p_id uuid, p_action text default 'activate')
returns uuid
language plpgsql security definer set search_path = public, private
as $$
declare v_environment text; v_current uuid;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_action not in ('activate', 'rollback') then
    raise exception 'invalid_release_action' using errcode = '22023';
  end if;
  select environment into v_environment
  from public.customer_service_config_versions where id = p_id for update;
  if not found then raise exception 'config_not_found' using errcode = 'P0002'; end if;
  select id into v_current from public.customer_service_config_versions
    where environment = v_environment and status = 'active' for update;
  if v_current = p_id then return p_id; end if;
  if not exists (
    select 1 from public.customer_service_evaluation_runs run
    where run.candidate_config_id = p_id and run.status = 'complete' and run.sample_size > 0
  ) then raise exception 'completed_evaluation_required' using errcode = '55000'; end if;
  if p_action = 'rollback' and not exists (
    select 1 from public.customer_service_config_release_events event
    where event.to_config_id = p_id
  ) then raise exception 'previous_release_required' using errcode = '55000'; end if;
  update public.customer_service_config_versions set status = 'archived', updated_at = now()
    where environment = v_environment and status = 'active';
  update public.customer_service_config_versions set status = 'active', activated_by = auth.uid(),
    activated_at = now(), updated_at = now() where id = p_id;
  insert into public.customer_service_config_release_events(
    environment, action, from_config_id, to_config_id, actor_id
  ) values (v_environment, p_action, v_current, p_id, auth.uid());
  return p_id;
end;
$$;

create or replace function public.customer_service_config_activate(p_id uuid)
returns uuid language sql security definer set search_path = public
as $$ select public.customer_service_config_release(p_id, 'activate'); $$;

create or replace function public.customer_service_config_rollback(p_id uuid)
returns uuid language sql security definer set search_path = public
as $$ select public.customer_service_config_release(p_id, 'rollback'); $$;

revoke all on function public.customer_service_outbound_claim(integer) from public, anon, authenticated;
revoke all on function public.customer_service_outbound_messages_list(text, integer) from public, anon;
revoke all on function public.customer_service_outbound_retry(uuid) from public, anon;
revoke all on function public.customer_service_verify_order_identity(text, uuid, text) from public, anon, authenticated;
revoke all on function public.customer_service_config_release(uuid, text) from public, anon;
revoke all on function public.customer_service_config_rollback(uuid) from public, anon;
grant execute on function public.customer_service_outbound_claim(integer) to service_role;
grant execute on function public.customer_service_outbound_messages_list(text, integer) to authenticated;
grant execute on function public.customer_service_outbound_retry(uuid) to authenticated;
grant execute on function public.customer_service_verify_order_identity(text, uuid, text) to service_role;
grant execute on function public.customer_service_config_release(uuid, text) to authenticated;
grant execute on function public.customer_service_config_rollback(uuid) to authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'fccd-customer-service-outbound-retry';

do $deployment$
begin
  if coalesce((
    select decrypted_secret from vault.decrypted_secrets
    where name = 'customer_service_outbound_retry_enabled' limit 1
  ), 'false') = 'true' then
    perform cron.schedule(
      'fccd-customer-service-outbound-retry',
      '*/5 * * * *',
      $cron$
        select net.http_post(
          url := (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'customer_service_outbound_retry_url' limit 1
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
              select decrypted_secret from vault.decrypted_secrets
              where name = 'customer_service_outbound_cron_secret' limit 1
            )
          ),
          body := '{"mode":"retry_outbound"}'::jsonb,
          timeout_milliseconds := 120000
        );
      $cron$
    );
  end if;
end;
$deployment$;
