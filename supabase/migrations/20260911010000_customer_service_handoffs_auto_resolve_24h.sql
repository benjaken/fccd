-- Auto-resolve WATI/customer-service handoffs after WhatsApp's 24-hour
-- customer-care window: once last_customer_message_at is older than 24 hours,
-- free-form session replies are no longer available, so mark the queue item
-- complete and return the conversation to the bot.

create or replace function public.customer_service_handoffs_auto_resolve_expired(
  p_now timestamptz default now(),
  p_ttl interval default interval '24 hours'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_count integer := 0;
  v_note text := '逾 24 小時無客戶訊息（WhatsApp 工作階段已結束）自動完成';
  r record;
begin
  for r in
    select
      request.id,
      request.status,
      request.phone_normalized,
      request.environment
    from public.customer_service_handoff_requests request
    where request.status <> 'resolved'
      and request.last_customer_message_at <= p_now - p_ttl
    order by request.last_customer_message_at asc
    for update of request skip locked
  loop
    update public.customer_service_handoff_requests request
    set status = 'resolved',
        resolution_note = v_note,
        resolved_at = p_now,
        resolved_by = null,
        updated_at = p_now
    where request.id = r.id;

    insert into public.customer_service_handoff_events (
      request_id, action, from_status, to_status, note, actor_id, created_at
    ) values (
      r.id, 'resolved', r.status, 'resolved', v_note, null, p_now
    );

    insert into public.customer_service_conversations (
      phone_normalized, state, selected_order_id, handoff_at, pending_request,
      active_goal, workflow_slots, suspended_goals, updated_at
    ) values (
      r.phone_normalized,
      'identifying',
      null,
      null,
      null,
      null,
      '{}'::jsonb,
      '[]'::jsonb,
      p_now
    )
    on conflict (phone_normalized) do update
    set state = 'identifying',
        selected_order_id = null,
        handoff_at = null,
        pending_request = null,
        active_goal = null,
        workflow_slots = '{}'::jsonb,
        suspended_goals = '[]'::jsonb,
        identity_verified_at = null,
        identity_verification_method = null,
        identity_verification_order_id = null,
        identity_verification_attempts = 0,
        updated_at = p_now;

    insert into public.customer_service_conversation_mode_events (
      environment, phone_normalized, source, from_state, to_state,
      mode, reason, actor_id, created_at
    ) values (
      coalesce(r.environment, 'production'),
      r.phone_normalized,
      'system',
      case r.status
        when 'in_progress' then 'human_owned'
        when 'resolved' then 'identifying'
        else 'awaiting_human'
      end,
      'identifying',
      'bot',
      '逾 24 小時無客戶訊息自動完成並交回機器人',
      null,
      p_now
    );

    resolved_count := resolved_count + 1;
  end loop;

  return resolved_count;
end;
$$;

comment on function public.customer_service_handoffs_auto_resolve_expired(timestamptz, interval) is
  'Marks unresolved WATI handoff requests resolved after the WhatsApp 24-hour session window (based on last_customer_message_at) and returns conversations to the bot.';

revoke all on function public.customer_service_handoffs_auto_resolve_expired(timestamptz, interval)
  from public, anon, authenticated;
grant execute on function public.customer_service_handoffs_auto_resolve_expired(timestamptz, interval)
  to service_role;

-- Close already-expired queue items on deploy.
select public.customer_service_handoffs_auto_resolve_expired();

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'fccd-customer-service-handoffs-auto-resolve';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

-- Run every 15 minutes so the WATI pending queue clears soon after the window ends.
select cron.schedule(
  'fccd-customer-service-handoffs-auto-resolve',
  '*/15 * * * *',
  $$select public.customer_service_handoffs_auto_resolve_expired()$$
);
