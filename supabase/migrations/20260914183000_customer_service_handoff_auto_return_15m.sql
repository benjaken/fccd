begin;

create or replace function private.customer_service_auto_reply_window_open(
  p_now timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce((
    select
      controls.bot_enabled
      and case
        when window_times.start_time = window_times.end_time then true
        when window_times.start_time < window_times.end_time then
          local_clock.current_time >= window_times.start_time
          and local_clock.current_time < window_times.end_time
        else
          local_clock.current_time >= window_times.start_time
          or local_clock.current_time < window_times.end_time
      end
    from public.customer_service_controls controls
    cross join lateral (
      select
        extract(dow from p_now at time zone controls.auto_reply_timezone)::integer as day_of_week,
        (p_now at time zone controls.auto_reply_timezone)::time as current_time
    ) local_clock
    cross join lateral (
      select
        case local_clock.day_of_week
          when 0 then controls.sunday_auto_reply_start
          when 6 then controls.saturday_auto_reply_start
          else controls.weekday_auto_reply_start
        end as start_time,
        case local_clock.day_of_week
          when 0 then controls.sunday_auto_reply_end
          when 6 then controls.saturday_auto_reply_end
          else controls.weekday_auto_reply_end
        end as end_time
    ) window_times
    where controls.id = 'global'
  ), false);
$$;

revoke all on function private.customer_service_auto_reply_window_open(timestamptz)
  from public, anon, authenticated;

-- Once a staff member has taken ownership, return the conversation to the bot
-- after 15 minutes without a new customer or human message. Unclaimed handoffs
-- retain the existing 24-hour expiry so they are not silently closed early.
-- Neither path returns control while automatic replies are disabled or outside
-- the configured weekday, Saturday, or Sunday reply window.
create or replace function public.customer_service_handoffs_auto_resolve_expired(
  p_now timestamptz default now(),
  p_ttl interval default interval '15 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_count integer := 0;
  r record;
begin
  for r in
    select
      request.id,
      request.status,
      request.phone_normalized,
      request.environment,
      case
        when request.status = 'in_progress'
          then '真人接管後連續 15 分鐘無新訊息，自動交回機器人'
        else '逾 24 小時無客戶訊息（WhatsApp 工作階段已結束）自動完成'
      end as resolution_note,
      case
        when request.status = 'in_progress'
          then coalesce(activity.last_message_at, conversation.handoff_at, request.updated_at)
        else request.last_customer_message_at
      end as last_activity_at
    from public.customer_service_handoff_requests request
    left join public.customer_service_conversations conversation
      on conversation.phone_normalized = request.phone_normalized
    left join lateral (
      select max(recent_activity.activity_at) as last_message_at
      from (
        select message.created_at as activity_at
        from public.customer_service_messages message
        where message.phone_normalized = request.phone_normalized
          and message.environment = request.environment
          and message.created_at >= coalesce(conversation.handoff_at, request.updated_at)
          and message.role in ('customer', 'human')
        union all
        select inbound.received_at as activity_at
        from public.customer_service_inbound_events inbound
        where inbound.phone_normalized = request.phone_normalized
          and inbound.received_at >= coalesce(conversation.handoff_at, request.updated_at)
      ) recent_activity
    ) activity on true
    where request.status <> 'resolved'
      and private.customer_service_auto_reply_window_open(p_now)
      and (
        (
          request.status = 'in_progress'
          and conversation.state = 'human_owned'
          and coalesce(activity.last_message_at, conversation.handoff_at, request.updated_at)
            <= p_now - p_ttl
        )
        or (
          request.status <> 'in_progress'
          and request.last_customer_message_at <= p_now - interval '24 hours'
        )
      )
    order by last_activity_at asc
    for update of request skip locked
  loop
    update public.customer_service_handoff_requests request
    set status = 'resolved',
        resolution_note = r.resolution_note,
        resolved_at = p_now,
        resolved_by = null,
        updated_at = p_now
    where request.id = r.id;

    insert into public.customer_service_handoff_events (
      request_id, action, from_status, to_status, note, actor_id, created_at
    ) values (
      r.id, 'resolved', r.status, 'resolved', r.resolution_note, null, p_now
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
        else 'awaiting_human'
      end,
      'identifying',
      'bot',
      r.resolution_note,
      null,
      p_now
    );

    resolved_count := resolved_count + 1;
  end loop;

  return resolved_count;
end;
$$;

comment on function public.customer_service_handoffs_auto_resolve_expired(timestamptz, interval) is
  'While auto-reply is enabled and in schedule, returns human-owned conversations to the bot after 15 minutes without customer or staff activity; unclaimed handoffs retain the 24-hour expiry.';

revoke all on function public.customer_service_handoffs_auto_resolve_expired(timestamptz, interval)
  from public, anon, authenticated;
grant execute on function public.customer_service_handoffs_auto_resolve_expired(timestamptz, interval)
  to service_role;

-- Apply the shorter human-idle timeout immediately on deployment.
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

select cron.schedule(
  'fccd-customer-service-handoffs-auto-resolve',
  '* * * * *',
  $$select public.customer_service_handoffs_auto_resolve_expired()$$
);

commit;
