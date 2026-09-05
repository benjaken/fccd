begin;

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values (
  'orders.customer_inquiries',
  '訂單詢問待處理',
  '/orders/customer-inquiries',
  18,
  true,
  'orders',
  'subpage'
)
on conflict (page_key) do update
set display_name = excluded.display_name,
    route = excluded.route,
    sort_order = excluded.sort_order,
    is_high_risk = excluded.is_high_risk,
    parent_page_key = excluded.parent_page_key,
    page_kind = excluded.page_kind,
    updated_at = now();

with roles(role) as (
  values
    ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'),
    ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select role, 'orders.customer_inquiries',
  role in ('Super Admin', 'Admin'),
  role in ('Super Admin', 'Admin')
from roles
on conflict (role, page_key) do nothing;

alter table public.customer_service_handoff_requests
  add column if not exists resolution_note text;

create table if not exists public.customer_service_handoff_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.customer_service_handoff_requests(id) on delete cascade,
  action text not null check (action in ('claimed', 'resolved', 'reopened')),
  from_status text,
  to_status text not null,
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_service_handoff_events_request_idx
  on public.customer_service_handoff_events (request_id, created_at desc);

alter table public.customer_service_handoff_events enable row level security;
revoke all on table public.customer_service_handoff_events from public, anon, authenticated;
grant all on table public.customer_service_handoff_events to service_role;

insert into public.customer_service_handoff_events (
  request_id, action, from_status, to_status, actor_id, created_at
)
select request.id, 'claimed', null, 'in_progress', request.claimed_by, request.claimed_at
from public.customer_service_handoff_requests request
where request.claimed_at is not null
  and not exists (
    select 1 from public.customer_service_handoff_events event
    where event.request_id = request.id and event.action = 'claimed'
  );

insert into public.customer_service_handoff_events (
  request_id, action, from_status, to_status, note, actor_id, created_at
)
select request.id, 'resolved', 'in_progress', 'resolved', request.resolution_note,
  request.resolved_by, request.resolved_at
from public.customer_service_handoff_requests request
where request.resolved_at is not null
  and not exists (
    select 1 from public.customer_service_handoff_events event
    where event.request_id = request.id and event.action = 'resolved'
  );

create or replace function public.customer_service_order_inquiries_list(
  p_status text default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  environment text,
  phone_normalized text,
  order_id uuid,
  order_number text,
  kind text,
  summary text,
  questions jsonb,
  message_count integer,
  status text,
  last_customer_message_at timestamptz,
  created_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid,
  claimed_by_name text,
  resolved_at timestamptz,
  resolved_by uuid,
  resolved_by_name text,
  resolution_note text,
  event_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
begin
  if not private.has_page_access('orders.customer_inquiries') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_status is not null
     and p_status not in ('pending', 'processing', 'notified', 'in_progress', 'resolved', 'failed') then
    raise exception 'invalid_handoff_status' using errcode = '22023';
  end if;

  return query
  with filtered as (
    select request.*
    from public.customer_service_handoff_requests request
    where (p_status is null or request.status = p_status)
      and (
        v_search = ''
        or request.phone_normalized ilike '%' || v_search || '%'
        or coalesce(request.order_number, '') ilike '%' || v_search || '%'
        or request.summary ilike '%' || v_search || '%'
      )
  )
  select request.id, request.environment, request.phone_normalized,
    request.order_id, request.order_number, request.kind, request.summary,
    request.questions, request.message_count, request.status,
    request.last_customer_message_at, request.created_at,
    request.claimed_at, request.claimed_by,
    coalesce(nullif(btrim(claimed.user_name), ''), claimed.email),
    request.resolved_at, request.resolved_by,
    coalesce(nullif(btrim(resolved.user_name), ''), resolved.email),
    request.resolution_note,
    (select count(*) from public.customer_service_handoff_events event
      where event.request_id = request.id),
    count(*) over()
  from filtered request
  left join public.user_profiles claimed on claimed.id = request.claimed_by
  left join public.user_profiles resolved on resolved.id = request.resolved_by
  order by
    case request.status
      when 'in_progress' then 0 when 'notified' then 1 when 'pending' then 2
      when 'processing' then 3 when 'failed' then 4 else 5
    end,
    request.last_customer_message_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.customer_service_order_inquiry_update(
  p_id uuid,
  p_action text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_request public.customer_service_handoff_requests%rowtype;
  v_next_status text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not private.has_page_manage('orders.customer_inquiries') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if p_action not in ('claim', 'resolve', 'reopen') then
    raise exception 'invalid_handoff_action' using errcode = '22023';
  end if;

  select request.* into v_request
  from public.customer_service_handoff_requests request
  where request.id = p_id
  for update;
  if not found then
    raise exception 'handoff_not_found' using errcode = 'P0002';
  end if;

  if p_action = 'claim' then
    if v_request.status not in ('pending', 'processing', 'notified', 'failed') then
      raise exception 'handoff_not_claimable' using errcode = '55000';
    end if;
    v_next_status := 'in_progress';
    update public.customer_service_handoff_requests request
    set status = v_next_status, claimed_at = now(), claimed_by = auth.uid(),
      resolution_note = null, resolved_at = null, resolved_by = null, updated_at = now()
    where request.id = p_id;
  elsif p_action = 'resolve' then
    if v_request.status <> 'in_progress' then
      raise exception 'handoff_not_in_progress' using errcode = '55000';
    end if;
    if v_note is null then
      raise exception 'resolution_note_required' using errcode = '22023';
    end if;
    v_next_status := 'resolved';
    update public.customer_service_handoff_requests request
    set status = v_next_status, resolution_note = v_note,
      resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
    where request.id = p_id;
  else
    if v_request.status <> 'resolved' then
      raise exception 'handoff_not_resolved' using errcode = '55000';
    end if;
    v_next_status := 'pending';
    update public.customer_service_handoff_requests request
    set status = v_next_status, resolution_note = null,
      resolved_at = null, resolved_by = null, claimed_at = null, claimed_by = null,
      notify_after = now(), updated_at = now()
    where request.id = p_id;
  end if;

  insert into public.customer_service_handoff_events (
    request_id, action, from_status, to_status, note, actor_id
  ) values (
    p_id,
    case p_action when 'claim' then 'claimed' when 'resolve' then 'resolved' else 'reopened' end,
    v_request.status,
    v_next_status,
    v_note,
    auth.uid()
  );

  insert into public.customer_service_conversations (
    phone_normalized, state, selected_order_id, handoff_at, pending_request,
    active_goal, workflow_slots, suspended_goals, updated_at
  ) values (
    v_request.phone_normalized,
    case v_next_status
      when 'in_progress' then 'human_owned'
      when 'pending' then 'awaiting_human'
      else 'identifying'
    end,
    null,
    case when v_next_status in ('in_progress', 'pending') then now() else null end,
    null,
    null,
    '{}'::jsonb,
    '[]'::jsonb,
    now()
  )
  on conflict (phone_normalized) do update
  set state = excluded.state,
      selected_order_id = null,
      handoff_at = excluded.handoff_at,
      pending_request = null,
      active_goal = null,
      workflow_slots = '{}'::jsonb,
      suspended_goals = '[]'::jsonb,
      identity_verified_at = null,
      identity_verification_method = null,
      identity_verification_order_id = null,
      identity_verification_attempts = 0,
      updated_at = now();

  insert into public.customer_service_conversation_mode_events (
    environment, phone_normalized, source, from_state, to_state,
    mode, reason, actor_id
  ) values (
    v_request.environment,
    v_request.phone_normalized,
    'order_inquiry_queue',
    case v_request.status
      when 'in_progress' then 'human_owned'
      when 'resolved' then 'identifying'
      else 'awaiting_human'
    end,
    case v_next_status
      when 'in_progress' then 'human_owned'
      when 'pending' then 'awaiting_human'
      else 'identifying'
    end,
    case when v_next_status = 'resolved' then 'bot' else 'human' end,
    case p_action
      when 'claim' then '訂單詢問列表真人接手'
      when 'resolve' then '訂單詢問完成並交回機器人'
      else '訂單詢問重新開啟等待真人處理'
    end,
    auth.uid()
  );

  return v_next_status;
end;
$$;

create or replace function public.customer_service_order_inquiries_pending_count()
returns bigint
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('orders.customer_inquiries') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return (
    select count(*)
    from public.customer_service_handoff_requests request
    where request.status <> 'resolved'
  );
end;
$$;

revoke all on function public.customer_service_order_inquiries_list(text, text, integer, integer)
  from public, anon;
revoke all on function public.customer_service_order_inquiry_update(uuid, text, text)
  from public, anon;
revoke all on function public.customer_service_order_inquiries_pending_count()
  from public, anon;
grant execute on function public.customer_service_order_inquiries_list(text, text, integer, integer)
  to authenticated;
grant execute on function public.customer_service_order_inquiry_update(uuid, text, text)
  to authenticated;
grant execute on function public.customer_service_order_inquiries_pending_count()
  to authenticated;

commit;
