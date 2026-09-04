-- Queue after-hours customer-service handoffs and notify the team at 09:00 HKT.

alter table public.customer_service_conversations
  drop constraint if exists customer_service_conversations_state_check;

alter table public.customer_service_conversations
  add constraint customer_service_conversations_state_check
  check (state in (
    'identifying',
    'picking_order',
    'picking_handoff_order',
    'collecting',
    'awaiting_human',
    'human_owned'
  ));

alter table public.customer_service_turns
  add column if not exists handoff_queued boolean not null default false;

create table if not exists public.customer_service_handoff_requests (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production',
  phone_normalized text not null,
  order_id uuid,
  order_number text,
  kind text not null default 'order_handoff',
  summary text not null,
  questions jsonb not null default '[]'::jsonb,
  message_count integer not null default 1 check (message_count > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'notified', 'in_progress', 'resolved', 'failed')),
  notify_after timestamptz not null,
  notified_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  attempts integer not null default 0,
  last_error text,
  last_customer_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_service_handoff_active_phone_uidx
  on public.customer_service_handoff_requests (environment, phone_normalized)
  where status in ('pending', 'processing', 'notified', 'in_progress', 'failed');

create index if not exists customer_service_handoff_due_idx
  on public.customer_service_handoff_requests (notify_after, created_at)
  where status in ('pending', 'failed');

alter table public.customer_service_handoff_requests enable row level security;
revoke all on table public.customer_service_handoff_requests from public, anon, authenticated;
grant all on table public.customer_service_handoff_requests to service_role;

create or replace function private.next_customer_service_handoff_notification_at(
  p_now timestamptz default now()
)
returns timestamptz
language sql
stable
set search_path = public, private
as $$
  select (
    case
      when (p_now at time zone 'Asia/Hong_Kong')::time < time '09:00'
        then (p_now at time zone 'Asia/Hong_Kong')::date + time '09:00'
      else ((p_now at time zone 'Asia/Hong_Kong')::date + 1) + time '09:00'
    end
  ) at time zone 'Asia/Hong_Kong';
$$;

create or replace function public.customer_service_handoff_enqueue(
  p_environment text,
  p_phone text,
  p_order_id uuid,
  p_order_number text,
  p_summary text,
  p_kind text default 'order_handoff'
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_id uuid;
  v_question jsonb := jsonb_build_object('at', now(), 'text', left(btrim(coalesce(p_summary, '')), 2000));
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if v_phone = '' or btrim(coalesce(p_summary, '')) = '' then
    raise exception 'handoff_details_required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(nullif(btrim(p_environment), ''), 'production') || ':' || v_phone,
    0
  ));

  select request.id into v_id
  from public.customer_service_handoff_requests request
  where request.environment = coalesce(nullif(btrim(p_environment), ''), 'production')
    and request.phone_normalized = v_phone
    and request.status in ('pending', 'processing', 'notified', 'in_progress', 'failed')
  for update;

  if v_id is null then
    insert into public.customer_service_handoff_requests (
      environment, phone_normalized, order_id, order_number, kind, summary,
      questions, notify_after
    ) values (
      coalesce(nullif(btrim(p_environment), ''), 'production'), v_phone, p_order_id,
      nullif(btrim(coalesce(p_order_number, '')), ''), coalesce(nullif(btrim(p_kind), ''), 'order_handoff'),
      left(btrim(p_summary), 2000), jsonb_build_array(v_question),
      private.next_customer_service_handoff_notification_at(now())
    ) returning id into v_id;
  else
    update public.customer_service_handoff_requests
    set
      order_id = coalesce(p_order_id, order_id),
      order_number = coalesce(nullif(btrim(coalesce(p_order_number, '')), ''), order_number),
      summary = left(btrim(p_summary), 2000),
      questions = questions || jsonb_build_array(v_question),
      message_count = message_count + 1,
      status = case when status = 'failed' then 'pending' else status end,
      last_customer_message_at = now(),
      updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.customer_service_handoff_claim(p_limit integer default 100)
returns setof public.customer_service_handoff_requests
language sql
security definer
set search_path = public
as $$
  update public.customer_service_handoff_requests request
  set status = 'processing', attempts = request.attempts + 1, updated_at = now()
  where request.id in (
    select candidate.id
    from public.customer_service_handoff_requests candidate
    where candidate.notify_after <= now()
      and (
        candidate.status in ('pending', 'failed')
        or (candidate.status = 'processing' and candidate.updated_at < now() - interval '15 minutes')
      )
    order by candidate.notify_after, candidate.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  returning request.*;
$$;

create or replace function public.customer_service_handoffs_list(
  p_status text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  phone_normalized text,
  order_number text,
  summary text,
  questions jsonb,
  message_count integer,
  status text,
  notify_after timestamptz,
  notified_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
    select request.id, request.phone_normalized, request.order_number, request.summary,
      request.questions, request.message_count, request.status, request.notify_after,
      request.notified_at, request.created_at
    from public.customer_service_handoff_requests request
    where p_status is null or request.status = p_status
    order by
      case request.status when 'in_progress' then 0 when 'notified' then 1 when 'pending' then 2 else 3 end,
      request.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function public.customer_service_conversation_set_mode(
  p_phone text,
  p_mode text
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if v_phone = '' or p_mode not in ('human', 'bot') then
    raise exception 'invalid_conversation_mode' using errcode = '22023';
  end if;

  insert into public.customer_service_conversations (
    phone_normalized, state, selected_order_id, handoff_at, pending_request, updated_at
  ) values (
    v_phone,
    case when p_mode = 'human' then 'human_owned' else 'identifying' end,
    null,
    case when p_mode = 'human' then now() else null end,
    null,
    now()
  )
  on conflict (phone_normalized) do update set
    state = excluded.state,
    selected_order_id = null,
    handoff_at = excluded.handoff_at,
    pending_request = null,
    updated_at = now();

  if p_mode = 'human' then
    update public.customer_service_handoff_requests
    set status = 'in_progress', claimed_at = now(), claimed_by = auth.uid(), updated_at = now()
    where phone_normalized = v_phone
      and status in ('pending', 'processing', 'notified', 'failed');
  else
    update public.customer_service_handoff_requests
    set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
    where phone_normalized = v_phone
      and status in ('pending', 'processing', 'notified', 'in_progress', 'failed');
  end if;
  return p_mode;
end;
$$;

revoke all on function public.customer_service_handoff_enqueue(text, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.customer_service_handoff_claim(integer) from public, anon, authenticated;
revoke all on function public.customer_service_handoffs_list(text, integer) from public, anon;
revoke all on function public.customer_service_conversation_set_mode(text, text) from public, anon;
grant execute on function public.customer_service_handoff_enqueue(text, text, uuid, text, text, text) to service_role;
grant execute on function public.customer_service_handoff_claim(integer) to service_role;
grant execute on function public.customer_service_handoffs_list(text, integer) to authenticated;
grant execute on function public.customer_service_conversation_set_mode(text, text) to authenticated;

-- Restore the intended after-hours window now that deferred handoff notifications exist.
update public.customer_service_controls
set auto_reply_start = '19:00', auto_reply_end = '09:00', updated_at = now()
where id = 'global';

-- pg_cron uses UTC: 01:00 UTC is 09:00 Asia/Hong_Kong.
select cron.unschedule(jobid)
from cron.job
where jobname = 'fccd-customer-service-handoff-digest';

do $deployment$
begin
  if coalesce((
    select decrypted_secret from vault.decrypted_secrets
    where name = 'customer_service_handoff_digest_enabled' limit 1
  ), 'false') = 'true' then
    perform cron.schedule(
      'fccd-customer-service-handoff-digest',
      '0 1 * * *',
      $cron$
        select net.http_post(
          url := (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'customer_service_handoff_digest_url' limit 1
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
              select decrypted_secret from vault.decrypted_secrets
              where name = 'customer_service_handoff_cron_secret' limit 1
            )
          ),
          body := '{"mode":"handoff_digest"}'::jsonb,
          timeout_milliseconds := 120000
        );
      $cron$
    );
  end if;
end;
$deployment$;
