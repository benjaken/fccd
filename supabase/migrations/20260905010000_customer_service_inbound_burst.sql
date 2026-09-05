create table if not exists public.customer_service_inbound_batches (
  environment text not null,
  phone_normalized text not null,
  version bigint not null default 1,
  status text not null default 'collecting'
    check (status in ('collecting', 'processing', 'idle', 'failed')),
  messages jsonb not null default '[]'::jsonb,
  first_received_at timestamptz,
  last_received_at timestamptz,
  process_after timestamptz,
  claimed_version bigint,
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (environment, phone_normalized),
  check (jsonb_typeof(messages) = 'array')
);

create index if not exists customer_service_inbound_batches_due_idx
  on public.customer_service_inbound_batches (environment, process_after)
  where status = 'collecting';

alter table public.customer_service_inbound_batches enable row level security;
revoke all on table public.customer_service_inbound_batches from public, anon, authenticated;
grant all on table public.customer_service_inbound_batches to service_role;

create or replace function public.customer_service_enqueue_inbound_batch(
  p_environment text,
  p_phone text,
  p_provider_message_id text,
  p_text text,
  p_received_at timestamptz default now()
)
returns table(version bigint, process_after timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := coalesce(p_received_at, now());
  v_message jsonb := jsonb_build_object(
    'providerMessageId', p_provider_message_id,
    'text', left(coalesce(p_text, ''), 2000),
    'receivedAt', v_now
  );
begin
  insert into public.customer_service_inbound_batches as batch (
    environment, phone_normalized, version, status, messages,
    first_received_at, last_received_at, process_after, updated_at
  ) values (
    p_environment, p_phone, 1, 'collecting', jsonb_build_array(v_message),
    v_now, v_now, v_now + interval '2.5 seconds', now()
  )
  on conflict (environment, phone_normalized) do update set
    version = batch.version + 1,
    status = case
      when batch.status = 'processing' then 'processing'
      else 'collecting'
    end,
    messages = case
      when batch.status in ('idle', 'failed') then jsonb_build_array(v_message)
      else batch.messages || jsonb_build_array(v_message)
    end,
    first_received_at = case
      when batch.status in ('idle', 'failed') then v_now
      else coalesce(batch.first_received_at, v_now)
    end,
    last_received_at = v_now,
    process_after = least(
      case
        when batch.status in ('idle', 'failed') then v_now + interval '5 seconds'
        else coalesce(batch.first_received_at, v_now) + interval '5 seconds'
      end,
      v_now + interval '2.5 seconds'
    ),
    last_error = null,
    updated_at = now()
  returning batch.version, batch.process_after
  into version, process_after;
  return next;
end;
$$;

create or replace function public.customer_service_claim_inbound_batch(
  p_environment text,
  p_phone text
)
returns table(
  claimed_version bigint,
  messages jsonb,
  process_after timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.customer_service_inbound_batches as batch
  set status = 'processing',
      claimed_version = batch.version,
      locked_at = now(),
      updated_at = now()
  where batch.environment = p_environment
    and batch.phone_normalized = p_phone
    and (
      (batch.status = 'collecting' and batch.process_after <= now())
      or (batch.status = 'processing' and batch.locked_at < now() - interval '2 minutes')
    )
  returning batch.claimed_version, batch.messages, batch.process_after;
end;
$$;

create or replace function public.customer_service_inbound_batch_is_current(
  p_environment text,
  p_phone text,
  p_claimed_version bigint
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.customer_service_inbound_batches batch
    where batch.environment = p_environment
      and batch.phone_normalized = p_phone
      and batch.status = 'processing'
      and batch.claimed_version = p_claimed_version
      and batch.version = p_claimed_version
  );
$$;

create or replace function public.customer_service_complete_inbound_batch(
  p_environment text,
  p_phone text,
  p_claimed_version bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_completed boolean := false;
begin
  update public.customer_service_inbound_batches as batch
  set status = case when batch.version = p_claimed_version then 'idle' else 'collecting' end,
      messages = case when batch.version = p_claimed_version then '[]'::jsonb else batch.messages end,
      first_received_at = case when batch.version = p_claimed_version then null else batch.first_received_at end,
      last_received_at = case when batch.version = p_claimed_version then null else batch.last_received_at end,
      process_after = case when batch.version = p_claimed_version then null else batch.process_after end,
      processed_at = case when batch.version = p_claimed_version then now() else batch.processed_at end,
      claimed_version = null,
      locked_at = null,
      last_error = null,
      updated_at = now()
  where batch.environment = p_environment
    and batch.phone_normalized = p_phone
    and batch.status = 'processing'
    and batch.claimed_version = p_claimed_version
  returning batch.version = p_claimed_version into v_completed;
  return coalesce(v_completed, false);
end;
$$;

create or replace function public.customer_service_fail_inbound_batch(
  p_environment text,
  p_phone text,
  p_claimed_version bigint,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_has_newer boolean := false;
begin
  update public.customer_service_inbound_batches as batch
  set status = case when batch.version = p_claimed_version then 'failed' else 'collecting' end,
      claimed_version = null,
      locked_at = null,
      last_error = left(coalesce(p_error, 'processing_failed'), 500),
      updated_at = now()
  where batch.environment = p_environment
    and batch.phone_normalized = p_phone
    and batch.status = 'processing'
    and batch.claimed_version = p_claimed_version
  returning batch.version <> p_claimed_version into v_has_newer;
  return coalesce(v_has_newer, false);
end;
$$;

revoke all on function public.customer_service_enqueue_inbound_batch(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.customer_service_claim_inbound_batch(text, text) from public, anon, authenticated;
revoke all on function public.customer_service_inbound_batch_is_current(text, text, bigint) from public, anon, authenticated;
revoke all on function public.customer_service_complete_inbound_batch(text, text, bigint) from public, anon, authenticated;
revoke all on function public.customer_service_fail_inbound_batch(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.customer_service_enqueue_inbound_batch(text, text, text, text, timestamptz) to service_role;
grant execute on function public.customer_service_claim_inbound_batch(text, text) to service_role;
grant execute on function public.customer_service_inbound_batch_is_current(text, text, bigint) to service_role;
grant execute on function public.customer_service_complete_inbound_batch(text, text, bigint) to service_role;
grant execute on function public.customer_service_fail_inbound_batch(text, text, bigint, text) to service_role;
