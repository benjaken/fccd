-- Collapse consecutive login_success rows (same actor, no logout between),
-- and record future successes atomically so the list stays deduped.

create or replace function public.record_login_log(
  p_event_type text,
  p_email text default null,
  p_user_id uuid default null,
  p_user_name text default null,
  p_role text default null,
  p_ip_address text default null,
  p_user_agent text default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_id uuid;
  latest_type text;
  new_id uuid;
begin
  if p_event_type is null
    or p_event_type not in (
      'login_success',
      'login_failure',
      'logout',
      'password_reset_request',
      'password_change'
    )
  then
    raise exception 'invalid_event_type';
  end if;

  if p_event_type = 'login_success'
    and (p_user_id is not null or p_email is not null)
  then
    select logs.id, logs.event_type
      into latest_id, latest_type
    from public.login_logs as logs
    where
      (p_user_id is not null and logs.user_id = p_user_id)
      or (
        p_user_id is null
        and p_email is not null
        and lower(logs.email) = lower(p_email)
      )
    order by logs.created_at desc, logs.id desc
    limit 1
    for update;

    if latest_type = 'login_success' then
      update public.login_logs
      set
        email = p_email,
        user_id = p_user_id,
        user_name = p_user_name,
        role = p_role,
        ip_address = p_ip_address,
        user_agent = p_user_agent,
        error_code = p_error_code,
        created_at = now()
      where id = latest_id;

      return jsonb_build_object(
        'ok', true,
        'replaced', true,
        'id', latest_id
      );
    end if;
  end if;

  insert into public.login_logs (
    event_type,
    email,
    user_id,
    user_name,
    role,
    ip_address,
    user_agent,
    error_code
  )
  values (
    p_event_type,
    p_email,
    p_user_id,
    p_user_name,
    p_role,
    p_ip_address,
    p_user_agent,
    p_error_code
  )
  returning id into new_id;

  return jsonb_build_object(
    'ok', true,
    'replaced', false,
    'id', new_id
  );
end;
$$;

revoke all on function public.record_login_log(
  text, text, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_login_log(
  text, text, uuid, text, text, text, text, text
) to service_role;

comment on function public.record_login_log(
  text, text, uuid, text, text, text, text, text
) is
  'Insert login activity; consecutive login_success for the same actor updates the latest row. Service role only.';

-- One-time cleanup: keep the newest login_success in each consecutive streak.
with base as (
  select
    id,
    event_type,
    coalesce(user_id::text, lower(email), id::text) as actor_key,
    created_at,
    lag(event_type) over (
      partition by coalesce(user_id::text, lower(email), id::text)
      order by created_at, id
    ) as prev_event
  from public.login_logs
),
ordered as (
  select
    id,
    event_type,
    actor_key,
    created_at,
    sum(
      case
        when event_type = 'login_success' and prev_event = 'login_success'
          then 0
        else 1
      end
    ) over (
      partition by actor_key
      order by created_at, id
    ) as streak_id
  from base
),
ranked_success as (
  select
    id,
    row_number() over (
      partition by actor_key, streak_id
      order by created_at desc, id desc
    ) as rn
  from ordered
  where event_type = 'login_success'
)
delete from public.login_logs as logs
using ranked_success as ranked
where logs.id = ranked.id
  and ranked.rn > 1;
