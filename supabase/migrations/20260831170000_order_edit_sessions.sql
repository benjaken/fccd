-- Active order-edit sessions protect the factory from printing a document
-- while Marketing is still changing it.  Sessions are token based so two
-- browser tabs cannot release one another's locks and stale sessions expire
-- after one hour without activity.

create table if not exists public.order_edit_sessions (
  lock_token uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create index if not exists order_edit_sessions_active_order_idx
  on public.order_edit_sessions(order_id, last_activity_at desc);

alter table public.order_edit_sessions enable row level security;

create or replace function public.touch_order_edit_session(
  p_order_id uuid,
  p_lock_token uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_touched_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.orders
    where id = p_order_id
      and document_type = 'order'
      and archived_at is null
  ) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  insert into public.order_edit_sessions(
    lock_token, order_id, user_id, created_at, last_activity_at
  ) values (
    p_lock_token, p_order_id, auth.uid(), v_touched_at, v_touched_at
  )
  on conflict (lock_token) do update
    set last_activity_at = excluded.last_activity_at
    where order_edit_sessions.order_id = excluded.order_id
      and order_edit_sessions.user_id = auth.uid();

  return v_touched_at;
end;
$$;

create or replace function public.release_order_edit_session(p_lock_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.order_edit_sessions
  where lock_token = p_lock_token
    and user_id = auth.uid();
$$;

create or replace function public.active_order_edit_ids(p_order_ids uuid[])
returns table(order_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct session.order_id
  from public.order_edit_sessions session
  where session.order_id = any(coalesce(p_order_ids, array[]::uuid[]))
    and session.last_activity_at > now() - interval '1 hour';
$$;

create or replace function public.is_order_edit_active(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_edit_sessions session
    where session.order_id = p_order_id
      and session.last_activity_at > now() - interval '1 hour'
  );
$$;

create or replace function public.assert_factory_order_printable(p_order_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_order_edit_active(p_order_id) then
    raise exception 'order_edit_in_progress' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.set_order_line_void(
  p_line_id uuid,
  p_is_void boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  update public.order_lines
  set is_void = p_is_void,
      updated_at = now()
  where id = p_line_id
  returning order_id into v_order_id;

  if v_order_id is null then
    raise exception 'order_line_not_found' using errcode = 'P0002';
  end if;

  perform private.recalculate_quote_total(v_order_id);
end;
$$;

revoke all on table public.order_edit_sessions from public, anon, authenticated;
revoke all on function public.touch_order_edit_session(uuid, uuid) from public;
revoke all on function public.release_order_edit_session(uuid) from public;
revoke all on function public.active_order_edit_ids(uuid[]) from public;
revoke all on function public.is_order_edit_active(uuid) from public;
revoke all on function public.assert_factory_order_printable(uuid) from public;
revoke all on function public.set_order_line_void(uuid, boolean) from public;

grant execute on function public.touch_order_edit_session(uuid, uuid) to authenticated;
grant execute on function public.release_order_edit_session(uuid) to authenticated;
grant execute on function public.active_order_edit_ids(uuid[]) to authenticated;
grant execute on function public.is_order_edit_active(uuid) to authenticated;
grant execute on function public.assert_factory_order_printable(uuid) to authenticated;
grant execute on function public.set_order_line_void(uuid, boolean) to authenticated;

comment on table public.order_edit_sessions is
  'Short-lived browser edit sessions. Factory printing treats sessions active within the last hour as a lock.';
